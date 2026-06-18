// Package weather provides the single-family location preference and a live
// current-conditions lookup via Open-Meteo (free, global, no API key). Both the
// settings and the lookup live here so the REST API stays a thin delegator.
package weather

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Open-Meteo endpoints (no key required).
const (
	forecastURL  = "https://api.open-meteo.com/v1/forecast"
	geocodingURL = "https://geocoding-api.open-meteo.com/v1/search"
	cacheTTL     = 10 * time.Minute
)

type Service struct {
	db   *sql.DB
	http *http.Client

	mu     sync.Mutex
	cached *Current
	cachAt time.Time
	cachID string // settings fingerprint the cache was built for
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db, http: &http.Client{Timeout: 8 * time.Second}}
}

// Settings is the family's weather location + unit preference. Latitude and
// Longitude are nil when no location has been configured yet.
type Settings struct {
	Latitude     *float64 `json:"latitude"`
	Longitude    *float64 `json:"longitude"`
	LocationName string   `json:"locationName"`
	Units        string   `json:"units"` // "celsius" | "fahrenheit"
}

// SettingsInput is the PATCH payload from the location picker.
type SettingsInput struct {
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	LocationName string  `json:"locationName"`
	Units        string  `json:"units"`
}

// Current is the resolved widget payload. Configured is false when no location
// is set yet (the header hides the widget in that case).
// The condition label is derived on the client from Code (localized); the
// backend only sends the structured fields + an icon key.
type Current struct {
	Configured   bool    `json:"configured"`
	Temperature  float64 `json:"temperature"`
	Units        string  `json:"units"`
	Code         int     `json:"code"` // WMO weather-interpretation code
	Icon         string  `json:"icon"` // icon key for the frontend
	LocationName string  `json:"locationName"`
}

// GeoResult is one geocoding match for the city-search picker.
type GeoResult struct {
	Name      string  `json:"name"`
	Country   string  `json:"country"`
	Admin1    string  `json:"admin1"` // region/state, for disambiguation
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func (s *Service) GetSettings() (*Settings, error) {
	var (
		lat, lon sql.NullFloat64
		name     sql.NullString
		units    string
	)
	err := s.db.QueryRow(
		`SELECT weather_latitude, weather_longitude, weather_location_name, weather_units FROM family LIMIT 1`).
		Scan(&lat, &lon, &name, &units)
	if err != nil {
		return nil, err
	}
	out := &Settings{LocationName: name.String, Units: normUnits(units)}
	if lat.Valid && lon.Valid {
		out.Latitude = &lat.Float64
		out.Longitude = &lon.Float64
	}
	return out, nil
}

func (s *Service) SaveSettings(in SettingsInput) (*Settings, error) {
	if in.Latitude < -90 || in.Latitude > 90 || in.Longitude < -180 || in.Longitude > 180 {
		return nil, errors.New("latitude/longitude out of range")
	}
	res, err := s.db.Exec(
		`UPDATE family SET weather_latitude = ?, weather_longitude = ?, weather_location_name = ?, weather_units = ?`,
		in.Latitude, in.Longitude, strings.TrimSpace(in.LocationName), normUnits(in.Units))
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errors.New("no family configured")
	}
	s.invalidate()
	return s.GetSettings()
}

// GetCurrent returns live conditions for the configured location, cached for a
// few minutes to avoid hammering the API on every page load.
func (s *Service) GetCurrent(ctx context.Context) (*Current, error) {
	settings, err := s.GetSettings()
	if err != nil {
		return nil, err
	}
	if settings.Latitude == nil || settings.Longitude == nil {
		return &Current{Configured: false}, nil
	}

	fp := fmt.Sprintf("%.4f,%.4f,%s", *settings.Latitude, *settings.Longitude, settings.Units)
	s.mu.Lock()
	if s.cached != nil && s.cachID == fp && time.Since(s.cachAt) < cacheTTL {
		c := *s.cached
		s.mu.Unlock()
		return &c, nil
	}
	s.mu.Unlock()

	tempUnit := "celsius"
	if settings.Units == "fahrenheit" {
		tempUnit = "fahrenheit"
	}
	q := url.Values{}
	q.Set("latitude", fmt.Sprintf("%.4f", *settings.Latitude))
	q.Set("longitude", fmt.Sprintf("%.4f", *settings.Longitude))
	q.Set("current", "temperature_2m,weather_code")
	q.Set("temperature_unit", tempUnit)

	var body struct {
		Current struct {
			Temp float64 `json:"temperature_2m"`
			Code int     `json:"weather_code"`
		} `json:"current"`
	}
	if err := s.getJSON(ctx, forecastURL+"?"+q.Encode(), &body); err != nil {
		return nil, err
	}

	out := &Current{
		Configured:   true,
		Temperature:  body.Current.Temp,
		Units:        settings.Units,
		Code:         body.Current.Code,
		Icon:         iconForCode(body.Current.Code),
		LocationName: settings.LocationName,
	}

	s.mu.Lock()
	s.cached, s.cachAt, s.cachID = out, time.Now(), fp
	s.mu.Unlock()

	c := *out
	return &c, nil
}

// Geocode resolves a free-text city query to candidate locations.
func (s *Service) Geocode(ctx context.Context, query string) ([]GeoResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []GeoResult{}, nil
	}
	q := url.Values{}
	q.Set("name", query)
	q.Set("count", "6")
	q.Set("language", "en")
	q.Set("format", "json")

	var body struct {
		Results []GeoResult `json:"results"`
	}
	if err := s.getJSON(ctx, geocodingURL+"?"+q.Encode(), &body); err != nil {
		return nil, err
	}
	if body.Results == nil {
		return []GeoResult{}, nil
	}
	return body.Results, nil
}

func (s *Service) getJSON(ctx context.Context, u string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("weather upstream returned %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(dst)
}

func (s *Service) invalidate() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

func normUnits(u string) string {
	if strings.ToLower(strings.TrimSpace(u)) == "fahrenheit" {
		return "fahrenheit"
	}
	return "celsius"
}

// iconForCode maps a WMO weather-interpretation code to an icon key the frontend
// resolves to a lucide icon. (The condition label is localized client-side from
// the code, so it isn't computed here.)
func iconForCode(code int) string {
	switch code {
	case 0:
		return "sun"
	case 1, 2:
		return "partly"
	case 45, 48:
		return "fog"
	case 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82:
		return "rain"
	case 71, 73, 75, 77, 85, 86:
		return "snow"
	case 95, 96, 99:
		return "storm"
	default: // 3 (overcast) and anything unmapped
		return "cloud"
	}
}

package api

import (
	"encoding/json"
	"net/http"

	"tribo/internal/weather"
)

// GET /api/weather — live conditions for the configured location.
func (s *Server) getWeather(w http.ResponseWriter, r *http.Request) {
	cur, err := s.weather.GetCurrent(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cur)
}

// GET /api/weather/settings — current location + unit preference.
func (s *Server) getWeatherSettings(w http.ResponseWriter, _ *http.Request) {
	settings, err := s.weather.GetSettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// PATCH /api/weather/settings — set location (lat/lon + name) and units.
func (s *Server) updateWeatherSettings(w http.ResponseWriter, r *http.Request) {
	var in weather.SettingsInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	settings, err := s.weather.SaveSettings(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// GET /api/weather/geocode?q=city — city-search candidates for the picker.
func (s *Server) geocodeWeather(w http.ResponseWriter, r *http.Request) {
	results, err := s.weather.Geocode(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, results)
}

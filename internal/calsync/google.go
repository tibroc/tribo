package calsync

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	gcal "google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

// googleConfig builds the OAuth2 config from the environment, or nil if Google
// sync isn't configured.
func googleConfig() *oauth2.Config {
	id := os.Getenv("GOOGLE_CLIENT_ID")
	secret := os.Getenv("GOOGLE_CLIENT_SECRET")
	if id == "" || secret == "" {
		return nil
	}
	redirect := os.Getenv("GOOGLE_REDIRECT_URL")
	if redirect == "" {
		redirect = "http://localhost:8080/auth/google/callback"
	}
	return &oauth2.Config{
		ClientID:     id,
		ClientSecret: secret,
		RedirectURL:  redirect,
		Scopes:       []string{gcal.CalendarScope},
		Endpoint:     google.Endpoint,
	}
}

// GoogleEnabled reports whether Google sync is configured.
func (e *Engine) GoogleEnabled() bool { return googleConfig() != nil }

// GoogleAuthURL returns the consent URL for connecting a Google account.
// AccessTypeOffline + ApprovalForce ensures we receive a refresh token.
func (e *Engine) GoogleAuthURL(state string) (string, error) {
	cfg := googleConfig()
	if cfg == nil {
		return "", errors.New("google sync not configured")
	}
	return cfg.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce), nil
}

// ConnectGoogle exchanges an OAuth code for tokens and stores a google source.
// Google calendars are a read-only overlay always assigned to a family member
// (so their events display in that person's color); memberID is required.
func (e *Engine) ConnectGoogle(ctx context.Context, code, displayName, memberID string) (string, error) {
	cfg := googleConfig()
	if cfg == nil {
		return "", errors.New("google sync not configured")
	}
	if memberID == "" {
		return "", errors.New("a family member must be chosen for the Google calendar")
	}
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return "", err
	}
	enc, err := e.sealToken(tok)
	if err != nil {
		return "", err
	}
	id := uuid.NewString()
	if displayName == "" {
		displayName = "Google Calendar"
	}
	// url holds the calendar id ("primary" for the account's main calendar).
	// read_only=1 + kind='external': pulled-only, never pushed.
	if _, err := e.db.Exec(
		`INSERT INTO calendar_source (id, type, display_name, is_shared, url, credentials, read_only, kind, member_id)
		 VALUES (?, 'google', ?, 0, 'primary', ?, 1, 'external', ?)`,
		id, displayName, enc, memberID); err != nil {
		return "", err
	}
	return id, nil
}

func (e *Engine) sealToken(tok *oauth2.Token) (string, error) {
	b, err := json.Marshal(tok)
	if err != nil {
		return "", err
	}
	return e.seal(b)
}

func (e *Engine) loadToken(sourceID string) (*oauth2.Token, error) {
	var enc string
	if err := e.db.QueryRow(`SELECT COALESCE(credentials, '') FROM calendar_source WHERE id = ?`, sourceID).Scan(&enc); err != nil {
		return nil, err
	}
	plain, err := e.open(enc)
	if err != nil {
		return nil, err
	}
	var tok oauth2.Token
	return &tok, json.Unmarshal(plain, &tok)
}

func (e *Engine) syncGoogle(ctx context.Context, src sourceRow, windowStart, windowEnd time.Time) error {
	cfg := googleConfig()
	if cfg == nil {
		return errors.New("google sync not configured")
	}
	tok, err := e.loadToken(src.id)
	if err != nil {
		return err
	}
	ts := cfg.TokenSource(ctx, tok)
	svc, err := gcal.NewService(ctx, option.WithHTTPClient(oauth2.NewClient(ctx, ts)))
	if err != nil {
		return err
	}

	calID := src.url
	if calID == "" {
		calID = "primary"
	}
	now := time.Now()
	res, err := svc.Events.List(calID).
		TimeMin(windowStart.Format(time.RFC3339)).
		TimeMax(windowEnd.Format(time.RFC3339)).
		SingleEvents(true).MaxResults(2500).Context(ctx).Do()
	if err != nil {
		return err
	}

	// The member this overlay belongs to (events show in their color via attendee).
	var memberID string
	_ = e.db.QueryRow(`SELECT COALESCE(member_id, '') FROM calendar_source WHERE id = ?`, src.id).Scan(&memberID)
	members, err := e.memberIDs()
	if err != nil {
		return err
	}

	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM event WHERE calendar_source_id = ? AND external_id IS NOT NULL`, src.id); err != nil {
		return err
	}
	count := 0
	for _, item := range res.Items {
		pe, ok := googleToEvent(item)
		if !ok {
			continue
		}
		// Prefix the cache id so a Google event id can't collide with a CalDAV UID.
		cacheID := "g-" + pe.uid
		if _, err := tx.Exec(
			`INSERT INTO event (id, calendar_source_id, title, description, location, start_at, end_at, all_day, external_id, visibility_tag)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'standard')`,
			cacheID, src.id, pe.title, nullable(pe.description), nullable(pe.location),
			pe.start, pe.end, b2i(pe.allDay), pe.uid); err != nil {
			return err
		}
		if memberID != "" && members[memberID] {
			if _, err := tx.Exec(`INSERT OR IGNORE INTO event_attendee (event_id, member_id) VALUES (?, ?)`, cacheID, memberID); err != nil {
				return err
			}
		}
		count++
	}
	if _, err := tx.Exec(`UPDATE calendar_source SET last_synced_at = ? WHERE id = ?`, now.Format(time.RFC3339), src.id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	// Persist a refreshed token if the source rotated it.
	if newTok, err := ts.Token(); err == nil && newTok.AccessToken != tok.AccessToken {
		if enc, err := e.sealToken(newTok); err == nil {
			_, _ = e.db.Exec(`UPDATE calendar_source SET credentials = ? WHERE id = ?`, enc, src.id)
		}
	}
	return nil
}

func googleToEvent(item *gcal.Event) (parsedEvent, bool) {
	if item == nil || item.Id == "" || item.Start == nil || item.End == nil {
		return parsedEvent{}, false
	}
	pe := parsedEvent{
		uid:         item.Id,
		title:       orUntitled(item.Summary),
		description: item.Description,
		location:    item.Location,
	}
	if item.Start.Date != "" { // all-day
		pe.allDay = true
		s, _ := time.Parse("2006-01-02", item.Start.Date)
		e, _ := time.Parse("2006-01-02", item.End.Date)
		if e.IsZero() {
			e = s.AddDate(0, 0, 1)
		}
		pe.start = s.Format(time.RFC3339)
		pe.end = e.Format(time.RFC3339)
	} else {
		s, err := time.Parse(time.RFC3339, item.Start.DateTime)
		if err != nil {
			return parsedEvent{}, false
		}
		e, err := time.Parse(time.RFC3339, item.End.DateTime)
		if err != nil {
			e = s.Add(time.Hour)
		}
		pe.start = s.Format(time.RFC3339)
		pe.end = e.Format(time.RFC3339)
	}
	return pe, true
}

func orUntitled(s string) string {
	if s == "" {
		return "(untitled)"
	}
	return s
}

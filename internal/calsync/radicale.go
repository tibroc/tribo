package calsync

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// RadicaleConfig is the env-configured main CalDAV backend. It is the system of
// record for all managed calendars; when BaseURL is empty, calendar features are
// disabled (Radicale is a hard requirement — see the calendar refactor plan).
type RadicaleConfig struct {
	BaseURL  string // collection home, e.g. http://radicale:5232/tribo/
	Username string
	Password string
}

func radicaleConfig() RadicaleConfig {
	return RadicaleConfig{
		BaseURL:  strings.TrimSpace(os.Getenv("RADICALE_URL")),
		Username: os.Getenv("RADICALE_USER"),
		Password: os.Getenv("RADICALE_PASSWORD"),
	}
}

// Enabled reports whether a Radicale backend is configured.
func (c RadicaleConfig) Enabled() bool { return c.BaseURL != "" }

// collectionURL returns the absolute URL of a managed collection by name, with a
// single trailing slash (CalDAV collections are directories).
func (c RadicaleConfig) collectionURL(name string) string {
	return strings.TrimRight(c.BaseURL, "/") + "/" + strings.Trim(name, "/") + "/"
}

// RadicaleEnabled reports whether the engine has a configured Radicale backend.
func (e *Engine) RadicaleEnabled() bool { return e.radicale.Enabled() }

// RadicaleReachable does a cheap authenticated probe of the backend home so the
// UI can show a "calendar backend unavailable" banner. Returns false (never
// errors) when unconfigured or unreachable.
func (e *Engine) RadicaleReachable(ctx context.Context) bool {
	if !e.radicale.Enabled() {
		return false
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodOptions, e.radicale.BaseURL, nil)
	if err != nil {
		return false
	}
	req.SetBasicAuth(e.radicale.Username, e.radicale.Password)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode < 500
}

const mkcalendarBody = `<?xml version="1.0" encoding="utf-8"?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:set><D:prop>
    <D:displayname>%s</D:displayname>
    <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>
    %s
  </D:prop></D:set>
</C:mkcalendar>`

// mkCalendar creates a CalDAV calendar collection at collectionURL. go-webdav
// v0.7.0 has no MKCALENDAR, so we issue the raw request (RFC 4791 §5.3.1). It is
// idempotent: an already-existing collection (405/409) counts as success.
func (e *Engine) mkCalendar(ctx context.Context, collectionURL, displayName, color string) error {
	colorProp := ""
	if color != "" {
		colorProp = "<A:calendar-color>" + xmlEscape(color) + "</A:calendar-color>"
	}
	body := fmt.Sprintf(mkcalendarBody, xmlEscape(displayName), colorProp)
	req, err := http.NewRequestWithContext(ctx, "MKCALENDAR", collectionURL, strings.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(e.radicale.Username, e.radicale.Password)
	req.Header.Set("Content-Type", "application/xml; charset=utf-8")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		return nil
	case resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusConflict:
		return nil // already exists
	default:
		return fmt.Errorf("mkcalendar %s: %s", collectionURL, resp.Status)
	}
}

func xmlEscape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

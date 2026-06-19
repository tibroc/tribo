package calsync

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"

	"tribo/internal/calendar"
)

// Tribo-specific iCalendar properties. They round-trip through Radicale so the
// disposable SQLite cache can be rebuilt; other CalDAV clients ignore them.
const (
	propVisibility       = "X-TRIBO-VISIBILITY"
	propRequiresGuardian = "X-TRIBO-REQUIRES-GUARDIAN"
	propIcon             = "X-TRIBO-ICON"
	propColor            = "X-TRIBO-COLOR"
	propAttendees        = "X-TRIBO-ATTENDEES"
)

// calDAVTimeout bounds a single event write so an unreachable backend fails fast.
const calDAVTimeout = 15 * time.Second

// PutEvent implements calendar.EventBackend: it writes the event to its owning
// CalDAV collection (the system of record) and returns the object UID. It is a
// cache-only no-op (returns "") for non-CalDAV, read-only, or urlless sources.
func (e *Engine) PutEvent(ctx context.Context, in calendar.BackendEvent) (string, error) {
	src, err := e.loadSource(in.SourceID)
	if err != nil {
		return "", err
	}
	if src.typ != "caldav" || src.url == "" || src.readOnly {
		return "", nil
	}
	// Fail fast if the backend is unreachable so the write surfaces an error
	// instead of hanging the request.
	ctx, cancel := context.WithTimeout(ctx, calDAVTimeout)
	defer cancel()
	uid := in.ExternalID
	if uid == "" {
		uid = in.ID
	}
	u, err := url.Parse(src.url)
	if err != nil {
		return "", err
	}
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, src.creds.Username, src.creds.Password)
	client, err := caldav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return "", err
	}
	if _, err := client.PutCalendarObject(ctx, objectPath(u.Path, uid), buildICS(in, uid)); err != nil {
		return "", err
	}
	return uid, nil
}

// DeleteEvent implements calendar.EventBackend: removes the object from its
// CalDAV collection. No-op for non-CalDAV sources or an empty UID.
func (e *Engine) DeleteEvent(ctx context.Context, sourceID, externalID string) error {
	if externalID == "" {
		return nil
	}
	src, err := e.loadSource(sourceID)
	if err != nil {
		return err
	}
	if src.typ != "caldav" || src.url == "" || src.readOnly {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, calDAVTimeout)
	defer cancel()
	u, err := url.Parse(src.url)
	if err != nil {
		return err
	}
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, src.creds.Username, src.creds.Password)
	wc, err := webdav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}
	return wc.RemoveAll(ctx, objectPath(u.Path, externalID))
}

// buildICS serializes a BackendEvent into a VCALENDAR/VEVENT carrying the
// X-TRIBO-* metadata.
func buildICS(in calendar.BackendEvent, uid string) *ical.Calendar {
	cal := ical.NewCalendar()
	cal.Props.SetText(ical.PropProductID, "-//Tribo//EN")
	cal.Props.SetText(ical.PropVersion, "2.0")

	ev := ical.NewEvent()
	ev.Props.SetText(ical.PropUID, uid)
	ev.Props.SetDateTime(ical.PropDateTimeStamp, time.Now().UTC())
	ev.Props.SetText(ical.PropSummary, in.Title)

	start, _ := time.Parse(time.RFC3339, in.StartAt)
	end, _ := time.Parse(time.RFC3339, in.EndAt)
	if in.AllDay {
		ev.Props.SetDate(ical.PropDateTimeStart, start)
		ev.Props.SetDate(ical.PropDateTimeEnd, end)
	} else {
		ev.Props.SetDateTime(ical.PropDateTimeStart, start)
		ev.Props.SetDateTime(ical.PropDateTimeEnd, end)
	}
	if in.Description != "" {
		ev.Props.SetText(ical.PropDescription, in.Description)
	}
	if in.Location != "" {
		ev.Props.SetText(ical.PropLocation, in.Location)
	}
	if in.VisibilityTag != "" {
		ev.Props.SetText(propVisibility, in.VisibilityTag)
	}
	if in.RequiresGuardian {
		ev.Props.SetText(propRequiresGuardian, "1")
	}
	if in.Icon != "" {
		ev.Props.SetText(propIcon, in.Icon)
	}
	if in.Color != "" {
		ev.Props.SetText(propColor, in.Color)
	}
	if len(in.AttendeeIDs) > 0 {
		ev.Props.SetText(propAttendees, strings.Join(in.AttendeeIDs, ","))
	}
	cal.Children = append(cal.Children, ev.Component)
	return cal
}

// objectPath joins a collection path and a UID into the .ics object path.
func objectPath(base, uid string) string {
	if base == "" || base[len(base)-1] != '/' {
		base += "/"
	}
	return base + uid + ".ics"
}

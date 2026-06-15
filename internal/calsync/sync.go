// Package calsync keeps SQLite consistent with external CalDAV calendars
// (pull + push). Radicale is treated as just another CalDAV source. Google sync
// is scaffolded but not yet implemented.
package calsync

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
	"github.com/google/uuid"
)

type Engine struct {
	db  *sql.DB
	key []byte
}

func NewEngine(db *sql.DB) *Engine {
	return &Engine{db: db, key: deriveKey()}
}

// NewSource is the payload to connect an external calendar.
type NewSource struct {
	Type        string `json:"type"` // caldav | google
	DisplayName string `json:"displayName"`
	URL         string `json:"url"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	ReadOnly    bool   `json:"readOnly"`
}

type sourceRow struct {
	id, typ, url string
	creds        creds
	readOnly     bool
}

// CreateSource stores a new external calendar source (credentials encrypted) and
// returns its id. The caller typically triggers an initial sync afterwards.
func (e *Engine) CreateSource(in NewSource) (string, error) {
	if in.Type != "caldav" && in.Type != "google" {
		return "", fmt.Errorf("unsupported source type %q", in.Type)
	}
	enc, err := e.encrypt(creds{Username: in.Username, Password: in.Password})
	if err != nil {
		return "", err
	}
	id := uuid.NewString()
	_, err = e.db.Exec(
		`INSERT INTO calendar_source (id, type, display_name, is_shared, url, credentials, read_only)
		 VALUES (?, ?, ?, 0, ?, ?, ?)`,
		id, in.Type, in.DisplayName, in.URL, enc, b2i(in.ReadOnly))
	return id, err
}

// DeleteSource removes a source and its synced events.
func (e *Engine) DeleteSource(id string) error {
	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM event WHERE calendar_source_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM calendar_source WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// Start runs an initial sync and then re-syncs all sources on an interval.
func (e *Engine) Start(ctx context.Context) {
	go func() {
		e.SyncAll(ctx)
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				e.SyncAll(ctx)
			}
		}
	}()
}

// SyncAll pulls every external (caldav/google) source.
func (e *Engine) SyncAll(ctx context.Context) {
	sources, err := e.externalSources()
	if err != nil {
		log.Printf("calsync: list sources: %v", err)
		return
	}
	for _, src := range sources {
		if err := e.syncSource(ctx, src); err != nil {
			log.Printf("calsync: sync %s (%s): %v", src.id, src.typ, err)
		}
	}
}

// SyncSourceByID pulls a single source now (used by the connect flow).
func (e *Engine) SyncSourceByID(ctx context.Context, id string) error {
	src, err := e.loadSource(id)
	if err != nil {
		return err
	}
	return e.syncSource(ctx, src)
}

func (e *Engine) syncSource(ctx context.Context, src sourceRow) error {
	switch src.typ {
	case "caldav":
		return e.syncCalDAV(ctx, src)
	case "google":
		return e.syncGoogle(ctx, src)
	default:
		return nil
	}
}

// ===== CalDAV =====

func (e *Engine) syncCalDAV(ctx context.Context, src sourceRow) error {
	u, err := url.Parse(src.url)
	if err != nil {
		return fmt.Errorf("bad url: %w", err)
	}
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, src.creds.Username, src.creds.Password)
	client, err := caldav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}

	now := time.Now()
	query := &caldav.CalendarQuery{
		CompRequest: caldav.CalendarCompRequest{Name: "VCALENDAR", AllProps: true, AllComps: true},
		CompFilter: caldav.CompFilter{
			Name:  "VCALENDAR",
			Comps: []caldav.CompFilter{{Name: "VEVENT", Start: now.AddDate(0, -3, 0), End: now.AddDate(1, 0, 0)}},
		},
	}
	objects, err := client.QueryCalendar(ctx, u.Path, query)
	if err != nil {
		return fmt.Errorf("query: %w", err)
	}

	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Full refresh of remote-origin events for this source.
	if _, err := tx.Exec(`DELETE FROM event WHERE calendar_source_id = ? AND external_id IS NOT NULL`, src.id); err != nil {
		return err
	}
	count := 0
	for _, obj := range objects {
		if obj.Data == nil {
			continue
		}
		for _, ev := range obj.Data.Events() {
			pe, ok := icalToEvent(ev)
			if !ok {
				continue
			}
			if _, err := tx.Exec(
				`INSERT INTO event (id, calendar_source_id, title, description, location, start_at, end_at, all_day, recurrence_rule, external_id, visibility_tag)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'standard')`,
				uuid.NewString(), src.id, pe.title, nullable(pe.description), nullable(pe.location),
				pe.start, pe.end, b2i(pe.allDay), nullable(pe.rrule), pe.uid); err != nil {
				return err
			}
			count++
		}
	}
	if _, err := tx.Exec(`UPDATE calendar_source SET last_synced_at = ? WHERE id = ?`, now.Format(time.RFC3339), src.id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("calsync: pulled %d events from %s", count, src.id)
	return nil
}

// PushEvent writes a locally-created/edited event to a writable external source
// (CalDAV or Google). Best-effort: returns nil for internal/read-only sources.
func (e *Engine) PushEvent(ctx context.Context, eventID string) error {
	var sourceID, title, startStr, endStr string
	var desc, loc, externalID *string
	var allDay int
	err := e.db.QueryRow(
		`SELECT calendar_source_id, title, description, location, start_at, end_at, all_day, external_id
		 FROM event WHERE id = ?`, eventID).
		Scan(&sourceID, &title, &desc, &loc, &startStr, &endStr, &allDay, &externalID)
	if err != nil {
		return err
	}
	src, err := e.loadSource(sourceID)
	if err != nil || src.readOnly {
		return nil
	}
	if src.typ == "google" {
		if externalID != nil && *externalID != "" {
			return nil // update-on-edit for Google isn't handled in v1
		}
		newID, err := e.pushGoogle(ctx, src, title, startStr, endStr, allDay != 0)
		if err != nil {
			return err
		}
		_, _ = e.db.Exec(`UPDATE event SET external_id = ? WHERE id = ?`, newID, eventID)
		return nil
	}
	if src.typ != "caldav" {
		return nil
	}

	uid := eventID
	if externalID != nil && *externalID != "" {
		uid = *externalID
	}
	cal := ical.NewCalendar()
	cal.Props.SetText(ical.PropProductID, "-//Tribo//EN")
	cal.Props.SetText(ical.PropVersion, "2.0")
	ev := ical.NewEvent()
	ev.Props.SetText(ical.PropUID, uid)
	ev.Props.SetDateTime(ical.PropDateTimeStamp, time.Now().UTC())
	ev.Props.SetText(ical.PropSummary, title)
	start, _ := time.Parse(time.RFC3339, startStr)
	end, _ := time.Parse(time.RFC3339, endStr)
	ev.Props.SetDateTime(ical.PropDateTimeStart, start)
	ev.Props.SetDateTime(ical.PropDateTimeEnd, end)
	if desc != nil {
		ev.Props.SetText(ical.PropDescription, *desc)
	}
	if loc != nil {
		ev.Props.SetText(ical.PropLocation, *loc)
	}
	cal.Children = append(cal.Children, ev.Component)

	u, _ := url.Parse(src.url)
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, src.creds.Username, src.creds.Password)
	client, err := caldav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}
	path := u.Path
	if path != "" && path[len(path)-1] != '/' {
		path += "/"
	}
	if _, err := client.PutCalendarObject(ctx, path+uid+".ics", cal); err != nil {
		return err
	}
	if externalID == nil || *externalID == "" {
		_, _ = e.db.Exec(`UPDATE event SET external_id = ? WHERE id = ?`, uid, eventID)
	}
	return nil
}

// ===== ICS mapping =====

type parsedEvent struct {
	uid, title, description, location, start, end, rrule string
	allDay                                               bool
}

func icalToEvent(ev ical.Event) (parsedEvent, bool) {
	uid := text(ev, ical.PropUID)
	if uid == "" {
		return parsedEvent{}, false
	}
	start, err := ev.DateTimeStart(time.Local)
	if err != nil {
		return parsedEvent{}, false
	}
	end, err := ev.DateTimeEnd(time.Local)
	if err != nil || end.IsZero() {
		end = start.Add(time.Hour)
	}
	allDay := false
	if p := ev.Props.Get(ical.PropDateTimeStart); p != nil {
		if p.ValueType() == ical.ValueDate {
			allDay = true
		}
	}
	return parsedEvent{
		uid:         uid,
		title:       textOr(ev, ical.PropSummary, "(untitled)"),
		description: text(ev, ical.PropDescription),
		location:    text(ev, ical.PropLocation),
		start:       start.Format(time.RFC3339),
		end:         end.Format(time.RFC3339),
		rrule:       text(ev, ical.PropRecurrenceRule),
		allDay:      allDay,
	}, true
}

func text(ev ical.Event, name string) string {
	if p := ev.Props.Get(name); p != nil {
		return p.Value
	}
	return ""
}

func textOr(ev ical.Event, name, fallback string) string {
	if v := text(ev, name); v != "" {
		return v
	}
	return fallback
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

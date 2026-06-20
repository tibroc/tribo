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
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"
	"github.com/google/uuid"

	"tribo/internal/calendar"
)

type Engine struct {
	db       *sql.DB
	key      []byte
	radicale RadicaleConfig

	// Sync window: the [from, to] span pulled into the cache. It covers a rolling
	// ±1 year and grows on demand as the user navigates further out (EnsureWindow).
	winMu   sync.Mutex
	winFrom time.Time
	winTo   time.Time
	syncMu  sync.Mutex // serializes source syncs (avoids concurrent full-refresh)
}

func NewEngine(db *sql.DB) *Engine {
	now := time.Now()
	return &Engine{
		db: db, key: deriveKey(), radicale: radicaleConfig(),
		winFrom: now.AddDate(-1, 0, 0), winTo: now.AddDate(1, 0, 0),
	}
}

// window returns the current sync span, first expanding it to always cover a
// rolling ±1 year from now.
func (e *Engine) window() (time.Time, time.Time) {
	e.winMu.Lock()
	defer e.winMu.Unlock()
	now := time.Now()
	if lo := now.AddDate(-1, 0, 0); lo.Before(e.winFrom) {
		e.winFrom = lo
	}
	if hi := now.AddDate(1, 0, 0); hi.After(e.winTo) {
		e.winTo = hi
	}
	return e.winFrom, e.winTo
}

// EnsureWindow makes sure events in [from, to] have been pulled into the cache.
// When a request falls outside the synced span, it widens the window and pulls
// on demand; otherwise it's a no-op (so it's cheap to call on every events read).
// Zero bounds are ignored.
func (e *Engine) EnsureWindow(ctx context.Context, from, to time.Time) {
	if !e.radicale.Enabled() {
		return
	}
	e.winMu.Lock()
	grew := false
	if !from.IsZero() && from.Before(e.winFrom) {
		e.winFrom, grew = from, true
	}
	if !to.IsZero() && to.After(e.winTo) {
		e.winTo, grew = to, true
	}
	e.winMu.Unlock()
	if grew {
		// Materialize birthdays + chores for any newly-covered range, then pull.
		if err := e.RefreshBirthdays(ctx); err != nil {
			log.Printf("calsync: birthday refresh on window grow: %v", err)
		}
		if err := e.ProjectChores(ctx); err != nil {
			log.Printf("calsync: chore projection on window grow: %v", err)
		}
		e.SyncAll(ctx)
	}
}

// NewSource is the payload to connect an external calendar.
type NewSource struct {
	Type        string `json:"type"` // caldav | google
	DisplayName string `json:"displayName"`
	URL         string `json:"url"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	ReadOnly    bool   `json:"readOnly"`
	MemberID    string `json:"memberId"` // optional: attach as a per-person overlay
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
	// A user-added CalDAV/Google source is an unmanaged per-person overlay
	// (kind=external). member_id is optional but expected for the new model.
	var memberID any
	if in.MemberID != "" {
		memberID = in.MemberID
	}
	_, err = e.db.Exec(
		`INSERT INTO calendar_source (id, type, display_name, is_shared, url, credentials, read_only, kind, member_id, managed)
		 VALUES (?, ?, ?, 0, ?, ?, ?, 'external', ?, 0)`,
		id, in.Type, in.DisplayName, in.URL, enc, b2i(in.ReadOnly), memberID)
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
	e.syncMu.Lock()
	defer e.syncMu.Unlock()
	from, to := e.window()
	switch src.typ {
	case "caldav":
		return e.syncCalDAV(ctx, src, from, to)
	case "google":
		return e.syncGoogle(ctx, src, from, to)
	default:
		return nil
	}
}

// ===== CalDAV =====

func (e *Engine) syncCalDAV(ctx context.Context, src sourceRow, windowStart, windowEnd time.Time) error {
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
			Comps: []caldav.CompFilter{{Name: "VEVENT", Start: windowStart, End: windowEnd}},
		},
	}
	objects, err := client.QueryCalendar(ctx, u.Path, query)
	if err != nil {
		return fmt.Errorf("query: %w", err)
	}

	members, err := e.memberIDs()
	if err != nil {
		return err
	}
	// Interpret zoneless ("floating") iCal times in the family's timezone, not the
	// server's, so wall-clock times (and guardian/work-overlap math) are stable
	// regardless of where Tribo runs.
	loc := e.familyLocation()

	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Full refresh: rebuild the cache for this source from the system of record.
	// The cache row id is the CalDAV UID, so our own events keep a stable id
	// across re-pulls (we generate UIDs); attendees/metadata come from X-TRIBO-*.
	if _, err := tx.Exec(`DELETE FROM event WHERE calendar_source_id = ? AND external_id IS NOT NULL`, src.id); err != nil {
		return err
	}
	count := 0
	for _, obj := range objects {
		if obj.Data == nil {
			continue
		}
		for _, ev := range obj.Data.Events() {
			pe, ok := icalToEvent(ev, loc)
			if !ok {
				continue
			}
			vis := pe.visibility
			if vis != "routine" && vis != "standard" && vis != "milestone" {
				vis = "standard"
			}
			if _, err := tx.Exec(
				`INSERT INTO event (id, calendar_source_id, title, description, location, start_at, end_at, all_day,
				   recurrence_rule, external_id, visibility_tag, requires_guardian, icon, color_override)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				pe.uid, src.id, pe.title, nullable(pe.description), nullable(pe.location),
				pe.start, pe.end, b2i(pe.allDay), nullable(pe.rrule), pe.uid, vis,
				b2i(pe.requiresGuardian), nullable(pe.icon), nullable(pe.color)); err != nil {
				return err
			}
			for _, mid := range pe.attendees {
				if members[mid] {
					if _, err := tx.Exec(`INSERT OR IGNORE INTO event_attendee (event_id, member_id) VALUES (?, ?)`, pe.uid, mid); err != nil {
						return err
					}
				}
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
	// Recompute guardian assignment/conflict over the synced window now that
	// attendees are in the cache (computed fields live only in the cache).
	if err := calendar.NewService(e.db, nil).RecomputeWindow(windowStart, windowEnd); err != nil {
		log.Printf("calsync: recompute after sync %s: %v", src.id, err)
	}
	log.Printf("calsync: pulled %d events from %s", count, src.id)
	return nil
}

// familyLocation is the family's timezone (for interpreting floating iCal times),
// falling back to the server's local zone.
func (e *Engine) familyLocation() *time.Location {
	var tz string
	_ = e.db.QueryRow(`SELECT COALESCE(timezone, '') FROM family LIMIT 1`).Scan(&tz)
	if tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			return l
		}
	}
	return time.Local
}

// memberIDs returns the set of valid family-member ids, for filtering attendees
// parsed from X-TRIBO-ATTENDEES before inserting (avoids FK violations on stale ids).
func (e *Engine) memberIDs() (map[string]bool, error) {
	rows, err := e.db.Query(`SELECT id FROM family_member`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// ===== ICS mapping =====

type parsedEvent struct {
	uid, title, description, location, start, end, rrule string
	allDay                                               bool
	// Tribo metadata carried as X-TRIBO-* props (empty/false for foreign events).
	visibility       string
	icon, color      string
	requiresGuardian bool
	attendees        []string // family-member ids
}

func icalToEvent(ev ical.Event, loc *time.Location) (parsedEvent, bool) {
	uid := text(ev, ical.PropUID)
	if uid == "" {
		return parsedEvent{}, false
	}
	start, err := ev.DateTimeStart(loc)
	if err != nil {
		return parsedEvent{}, false
	}
	end, err := ev.DateTimeEnd(loc)
	if err != nil || end.IsZero() {
		end = start.Add(time.Hour)
	}
	allDay := false
	if p := ev.Props.Get(ical.PropDateTimeStart); p != nil {
		if p.ValueType() == ical.ValueDate {
			allDay = true
		}
	}
	var attendees []string
	if a := text(ev, propAttendees); a != "" {
		for _, id := range strings.Split(a, ",") {
			if id = strings.TrimSpace(id); id != "" {
				attendees = append(attendees, id)
			}
		}
	}
	return parsedEvent{
		uid:              uid,
		title:            textOr(ev, ical.PropSummary, "(untitled)"),
		description:      text(ev, ical.PropDescription),
		location:         text(ev, ical.PropLocation),
		start:            start.Format(time.RFC3339),
		end:              end.Format(time.RFC3339),
		rrule:            text(ev, ical.PropRecurrenceRule),
		allDay:           allDay,
		visibility:       text(ev, propVisibility),
		icon:             text(ev, propIcon),
		color:            text(ev, propColor),
		requiresGuardian: text(ev, propRequiresGuardian) == "1",
		attendees:        attendees,
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

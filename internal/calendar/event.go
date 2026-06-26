// Package calendar owns event CRUD (and later: recurrence expansion, guardian/
// conflict logic, visibility tags). Both the REST API and MCP server call here.
package calendar

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ValidationError marks an error as caused by bad client input rather than a
// backend/server failure, so REST handlers can map it to 400 instead of 502.
type ValidationError struct{ msg string }

func (e ValidationError) Error() string { return e.msg }

func invalid(msg string) error { return ValidationError{msg} }

// ErrNotFound is returned when an event id doesn't exist in the cache.
var ErrNotFound = errors.New("event not found")

type Event struct {
	ID                 string   `json:"id"`
	CalendarSourceID   string   `json:"calendarSourceId"`
	Title              string   `json:"title"`
	Description        *string  `json:"description,omitempty"`
	Location           *string  `json:"location,omitempty"`
	StartAt            string   `json:"startAt"` // RFC3339
	EndAt              string   `json:"endAt"`
	AllDay             bool     `json:"allDay"`
	Icon               *string  `json:"icon,omitempty"`
	ColorOverride      *string  `json:"colorOverride,omitempty"`
	VisibilityTag      string   `json:"visibilityTag"`
	RequiresGuardian   bool     `json:"requiresGuardian"`
	AssignedGuardianID *string  `json:"assignedGuardianId,omitempty"` // computed
	ConflictStatus     string   `json:"conflictStatus"`               // computed: none | needs_guardian
	ExternalAttendees  *string  `json:"externalAttendees,omitempty"`
	IsShared           bool     `json:"isShared"`    // event lives on a shared calendar source
	AttendeeIDs        []string `json:"attendeeIds"` // family-member ids
}

// NewEvent is the payload accepted by CreateEvent (POST /api/events).
type NewEvent struct {
	CalendarSourceID  string   `json:"calendarSourceId"`
	Title             string   `json:"title"`
	Description       *string  `json:"description"`
	Location          *string  `json:"location"`
	StartAt           string   `json:"startAt"`
	EndAt             string   `json:"endAt"`
	AllDay            bool     `json:"allDay"`
	Icon              *string  `json:"icon"`
	ColorOverride     *string  `json:"colorOverride"`
	VisibilityTag     string   `json:"visibilityTag"`
	RequiresGuardian  bool     `json:"requiresGuardian"`
	ExternalAttendees *string  `json:"externalAttendees"`
	AttendeeIDs       []string `json:"attendeeIds"`
}

type Source struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"`
	DisplayName string  `json:"displayName"`
	IsShared    bool    `json:"isShared"`
	ReadOnly    bool    `json:"readOnly"`
	Kind        string  `json:"kind"`               // person|family|birthdays|chores|external
	MemberID    *string `json:"memberId,omitempty"` // person + Google overlays
	Managed     bool    `json:"managed"`            // auto-provisioned; not user-editable
}

type Service struct {
	db      *sql.DB
	backend EventBackend // CalDAV system of record; nil = cache/recompute-only
}

// NewService builds the calendar service. Pass a backend (calsync.Engine) to make
// writes CalDAV-first; pass nil for read/recompute-only use (seed, sync engine).
func NewService(db *sql.DB, backend EventBackend) *Service {
	return &Service{db: db, backend: backend}
}

// ListSources returns the configured calendar sources.
func (s *Service) ListSources() ([]Source, error) {
	rows, err := s.db.Query(`SELECT id, type, display_name, is_shared, read_only, kind, member_id, managed FROM calendar_source ORDER BY is_shared, display_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Source{}
	for rows.Next() {
		var src Source
		var shared, ro, managed int
		if err := rows.Scan(&src.ID, &src.Type, &src.DisplayName, &shared, &ro, &src.Kind, &src.MemberID, &managed); err != nil {
			return nil, err
		}
		src.IsShared = shared != 0
		src.ReadOnly = ro != 0
		src.Managed = managed != 0
		out = append(out, src)
	}
	return out, rows.Err()
}

// RecomputeWindow recomputes guardian state for guardian-needed events
// overlapping [start, end]. Exposed for startup/seed use.
func (s *Service) RecomputeWindow(start, end time.Time) error {
	return s.recomputeWindow(start, end)
}

// ListEvents returns events overlapping [from, to). Either bound may be zero to
// leave it open. Results are ordered by start time, with attendee ids attached.
func (s *Service) ListEvents(from, to time.Time) ([]Event, error) {
	q := `SELECT e.id, e.calendar_source_id, e.title, e.description, e.location,
	             e.start_at, e.end_at, e.all_day, e.icon, e.color_override,
	             e.visibility_tag, e.requires_guardian, e.assigned_guardian_id, e.conflict_status,
	             e.external_attendees, cs.is_shared
	      FROM event e
	      JOIN calendar_source cs ON cs.id = e.calendar_source_id
	      WHERE 1=1`
	var args []any
	if !to.IsZero() {
		q += ` AND e.start_at < ?`
		args = append(args, to.Format(time.RFC3339))
	}
	if !from.IsZero() {
		q += ` AND e.end_at > ?`
		args = append(args, from.Format(time.RFC3339))
	}
	q += ` ORDER BY e.start_at`

	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []Event{}
	byID := map[string]int{}
	for rows.Next() {
		var e Event
		var allDay, requiresGuardian, isShared int
		if err := rows.Scan(&e.ID, &e.CalendarSourceID, &e.Title, &e.Description, &e.Location,
			&e.StartAt, &e.EndAt, &allDay, &e.Icon, &e.ColorOverride,
			&e.VisibilityTag, &requiresGuardian, &e.AssignedGuardianID, &e.ConflictStatus,
			&e.ExternalAttendees, &isShared); err != nil {
			return nil, err
		}
		e.AllDay = allDay != 0
		e.RequiresGuardian = requiresGuardian != 0
		e.IsShared = isShared != 0
		e.AttendeeIDs = []string{}
		byID[e.ID] = len(events)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(events) > 0 {
		if err := s.attachAttendees(events, byID); err != nil {
			return nil, err
		}
	}
	return events, nil
}

func (s *Service) attachAttendees(events []Event, byID map[string]int) error {
	rows, err := s.db.Query(`SELECT event_id, member_id FROM event_attendee`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var eid, mid string
		if err := rows.Scan(&eid, &mid); err != nil {
			return err
		}
		if i, ok := byID[eid]; ok {
			events[i].AttendeeIDs = append(events[i].AttendeeIDs, mid)
		}
	}
	return rows.Err()
}

// CreateEvent writes a new event to the CalDAV backend (system of record), then
// upserts the local cache row + attendees and recomputes guardian state. The PUT
// happens first so a backend failure surfaces to the caller without leaving a
// phantom cache row.
func (s *Service) CreateEvent(ctx context.Context, in NewEvent) (*Event, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, invalid("title is required")
	}
	start, err := time.Parse(time.RFC3339, in.StartAt)
	if err != nil {
		return nil, invalid("startAt must be RFC3339")
	}
	end, err := time.Parse(time.RFC3339, in.EndAt)
	if err != nil {
		return nil, invalid("endAt must be RFC3339")
	}
	if end.Before(start) {
		return nil, invalid("endAt must be after startAt")
	}
	if in.VisibilityTag == "" {
		in.VisibilityTag = "standard"
	}
	if in.CalendarSourceID == "" {
		return nil, invalid("calendarSourceId is required")
	}

	id := uuid.NewString()
	externalID := ""
	if s.backend != nil {
		ext, err := s.backend.PutEvent(ctx, s.backendEvent(id, "", in.CalendarSourceID, in))
		if err != nil {
			return nil, fmt.Errorf("calendar backend: %w", err)
		}
		externalID = ext
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`INSERT INTO event (id, calendar_source_id, title, description, location,
		   start_at, end_at, all_day, icon, color_override, visibility_tag,
		   requires_guardian, external_attendees, external_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.CalendarSourceID, in.Title, in.Description, in.Location,
		in.StartAt, in.EndAt, b2i(in.AllDay), in.Icon, in.ColorOverride,
		in.VisibilityTag, b2i(in.RequiresGuardian), in.ExternalAttendees, nz(externalID)); err != nil {
		return nil, err
	}
	for _, mid := range in.AttendeeIDs {
		if _, err := tx.Exec(`INSERT INTO event_attendee (event_id, member_id) VALUES (?, ?)`, id, mid); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	// Recompute guardian assignment/conflict for every guardian-needed event
	// overlapping this one's window (this event, and others it may now conflict).
	if err := s.recomputeWindow(start, end); err != nil {
		return nil, err
	}
	return s.getByID(id)
}

// backendEvent assembles the serialization payload from a NewEvent.
func (s *Service) backendEvent(id, externalID, sourceID string, in NewEvent) BackendEvent {
	return BackendEvent{
		ID:               id,
		ExternalID:       externalID,
		SourceID:         sourceID,
		Title:            in.Title,
		Description:      deref(in.Description),
		Location:         deref(in.Location),
		StartAt:          in.StartAt,
		EndAt:            in.EndAt,
		AllDay:           in.AllDay,
		VisibilityTag:    in.VisibilityTag,
		RequiresGuardian: in.RequiresGuardian,
		Icon:             deref(in.Icon),
		Color:            deref(in.ColorOverride),
		AttendeeIDs:      in.AttendeeIDs,
	}
}

// UpdateEvent rewrites the event on the CalDAV backend (same UID), then updates
// the cache + attendees and recomputes guardian state over old and new windows.
func (s *Service) UpdateEvent(ctx context.Context, id string, in NewEvent) (*Event, error) {
	prev, err := s.getByID(id)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Title) == "" {
		return nil, invalid("title is required")
	}
	start, err := time.Parse(time.RFC3339, in.StartAt)
	if err != nil {
		return nil, invalid("startAt must be RFC3339")
	}
	end, err := time.Parse(time.RFC3339, in.EndAt)
	if err != nil {
		return nil, invalid("endAt must be RFC3339")
	}
	if end.Before(start) {
		return nil, invalid("endAt must be after startAt")
	}
	if in.VisibilityTag == "" {
		in.VisibilityTag = "standard"
	}

	// Events stay on their original calendar; rewrite that collection's object.
	sourceID, externalID := s.sourceAndExternal(id)
	if s.backend != nil {
		ext, err := s.backend.PutEvent(ctx, s.backendEvent(id, externalID, sourceID, in))
		if err != nil {
			return nil, fmt.Errorf("calendar backend: %w", err)
		}
		externalID = ext
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE event SET title=?, description=?, location=?, start_at=?, end_at=?,
		   all_day=?, icon=?, color_override=?, visibility_tag=?, requires_guardian=?, external_attendees=?, external_id=?
		 WHERE id=?`,
		in.Title, in.Description, in.Location, in.StartAt, in.EndAt,
		b2i(in.AllDay), in.Icon, in.ColorOverride, in.VisibilityTag, b2i(in.RequiresGuardian), in.ExternalAttendees, nz(externalID), id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`DELETE FROM event_attendee WHERE event_id=?`, id); err != nil {
		return nil, err
	}
	for _, mid := range in.AttendeeIDs {
		if _, err := tx.Exec(`INSERT INTO event_attendee (event_id, member_id) VALUES (?, ?)`, id, mid); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	// Recompute over the union of the old and new windows.
	prevStart, _ := time.Parse(time.RFC3339, prev.StartAt)
	prevEnd, _ := time.Parse(time.RFC3339, prev.EndAt)
	if err := s.recomputeWindow(minTime(start, prevStart), maxTime(end, prevEnd)); err != nil {
		return nil, err
	}
	return s.getByID(id)
}

// DeleteEvent removes the object from the CalDAV backend first, then the cache
// row (attendees cascade), then recomputes guardian state over its window.
func (s *Service) DeleteEvent(ctx context.Context, id string) error {
	prev, err := s.getByID(id)
	if err != nil {
		return err
	}
	sourceID, externalID := s.sourceAndExternal(id)
	if s.backend != nil {
		if err := s.backend.DeleteEvent(ctx, sourceID, externalID); err != nil {
			return fmt.Errorf("calendar backend: %w", err)
		}
	}
	if _, err := s.db.Exec(`DELETE FROM event WHERE id=?`, id); err != nil {
		return err
	}
	start, _ := time.Parse(time.RFC3339, prev.StartAt)
	end, _ := time.Parse(time.RFC3339, prev.EndAt)
	return s.recomputeWindow(start, end)
}

// sourceAndExternal returns an event's calendar source id and external (CalDAV)
// id from the cache.
func (s *Service) sourceAndExternal(id string) (sourceID, externalID string) {
	_ = s.db.QueryRow(`SELECT calendar_source_id, COALESCE(external_id, '') FROM event WHERE id=?`, id).
		Scan(&sourceID, &externalID)
	return sourceID, externalID
}

// getByID returns a single event with attendees attached.
func (s *Service) getByID(id string) (*Event, error) {
	var e Event
	var allDay, requiresGuardian, isShared int
	err := s.db.QueryRow(
		`SELECT e.id, e.calendar_source_id, e.title, e.description, e.location,
		        e.start_at, e.end_at, e.all_day, e.icon, e.color_override,
		        e.visibility_tag, e.requires_guardian, e.assigned_guardian_id, e.conflict_status,
		        e.external_attendees, cs.is_shared
		 FROM event e
		 JOIN calendar_source cs ON cs.id = e.calendar_source_id
		 WHERE e.id = ?`, id).
		Scan(&e.ID, &e.CalendarSourceID, &e.Title, &e.Description, &e.Location,
			&e.StartAt, &e.EndAt, &allDay, &e.Icon, &e.ColorOverride,
			&e.VisibilityTag, &requiresGuardian, &e.AssignedGuardianID, &e.ConflictStatus,
			&e.ExternalAttendees, &isShared)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	e.AllDay = allDay != 0
	e.RequiresGuardian = requiresGuardian != 0
	e.IsShared = isShared != 0
	e.AttendeeIDs = []string{}

	rows, err := s.db.Query(`SELECT member_id FROM event_attendee WHERE event_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var mid string
		if err := rows.Scan(&mid); err != nil {
			return nil, err
		}
		e.AttendeeIDs = append(e.AttendeeIDs, mid)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &e, nil
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// nz returns nil for an empty string so it stores as SQL NULL.
func nz(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

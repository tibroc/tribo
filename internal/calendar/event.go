// Package calendar owns event CRUD (and later: recurrence expansion, guardian/
// conflict logic, visibility tags). Both the REST API and MCP server call here.
package calendar

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Event struct {
	ID                string   `json:"id"`
	CalendarSourceID  string   `json:"calendarSourceId"`
	Title             string   `json:"title"`
	Description       *string  `json:"description,omitempty"`
	Location          *string  `json:"location,omitempty"`
	StartAt           string   `json:"startAt"` // RFC3339
	EndAt             string   `json:"endAt"`
	AllDay            bool     `json:"allDay"`
	Icon              *string  `json:"icon,omitempty"`
	ColorOverride     *string  `json:"colorOverride,omitempty"`
	VisibilityTag     string   `json:"visibilityTag"`
	RequiresGuardian  bool     `json:"requiresGuardian"`
	ConflictStatus    string   `json:"conflictStatus"`
	ExternalAttendees *string  `json:"externalAttendees,omitempty"`
	IsShared          bool     `json:"isShared"`              // event lives on a shared calendar source
	AttendeeIDs       []string `json:"attendeeIds"`           // family-member ids
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

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

// ListEvents returns events overlapping [from, to). Either bound may be zero to
// leave it open. Results are ordered by start time, with attendee ids attached.
func (s *Service) ListEvents(from, to time.Time) ([]Event, error) {
	q := `SELECT e.id, e.calendar_source_id, e.title, e.description, e.location,
	             e.start_at, e.end_at, e.all_day, e.icon, e.color_override,
	             e.visibility_tag, e.requires_guardian, e.conflict_status,
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
			&e.VisibilityTag, &requiresGuardian, &e.ConflictStatus,
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

// CreateEvent inserts a new event and its attendees, returning the stored row.
func (s *Service) CreateEvent(in NewEvent) (*Event, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	start, err := time.Parse(time.RFC3339, in.StartAt)
	if err != nil {
		return nil, errors.New("startAt must be RFC3339")
	}
	end, err := time.Parse(time.RFC3339, in.EndAt)
	if err != nil {
		return nil, errors.New("endAt must be RFC3339")
	}
	if end.Before(start) {
		return nil, errors.New("endAt must be after startAt")
	}
	if in.VisibilityTag == "" {
		in.VisibilityTag = "standard"
	}
	if in.CalendarSourceID == "" {
		return nil, errors.New("calendarSourceId is required")
	}

	id := uuid.NewString()
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`INSERT INTO event (id, calendar_source_id, title, description, location,
		   start_at, end_at, all_day, icon, color_override, visibility_tag,
		   requires_guardian, external_attendees)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, in.CalendarSourceID, in.Title, in.Description, in.Location,
		in.StartAt, in.EndAt, b2i(in.AllDay), in.Icon, in.ColorOverride,
		in.VisibilityTag, b2i(in.RequiresGuardian), in.ExternalAttendees); err != nil {
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

	events, err := s.ListEvents(time.Time{}, time.Time{})
	if err != nil {
		return nil, err
	}
	for i := range events {
		if events[i].ID == id {
			return &events[i], nil
		}
	}
	return nil, errors.New("event not found after insert")
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

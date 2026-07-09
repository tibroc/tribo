// Package tools holds the assistant-facing tool implementations shared by the
// MCP server (internal/mcp) and the in-app chat assistant (internal/assistant).
// Both surfaces are thin adapters over this package — business logic lives
// once, here, on top of the same services the REST API uses.
package tools

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/todos"
)

type Deps struct {
	db        *sql.DB
	events    *calendar.Service
	chores    *chores.Service
	todos     *todos.Service
	family    *family.Service
	choreProj choreProjector
}

// choreProjector refreshes the Radicale Chores collection after a status change.
// Implemented by *calsync.Engine; kept optional so tests can pass nil.
type choreProjector interface {
	RadicaleEnabled() bool
	ProjectChores(ctx context.Context) error
}

// New builds the shared tool dependencies. backend is the CalDAV system of
// record (calsync.Engine) so tool-created events are written to Radicale like
// the REST path; pass nil for cache-only use (tests).
func New(db *sql.DB, backend calendar.EventBackend) *Deps {
	d := &Deps{
		db:     db,
		events: calendar.NewService(db, backend),
		chores: chores.NewService(db),
		todos:  todos.NewService(db),
		family: family.NewService(db),
	}
	if cp, ok := backend.(choreProjector); ok {
		d.choreProj = cp
	}
	return d
}

// ===== Tool I/O types (shared by MCP + chat) =====

type EventDTO struct {
	Title  string `json:"title"`
	Start  string `json:"start"`
	End    string `json:"end"`
	Person string `json:"person"`
}

type TodayOut struct {
	Date   string     `json:"date"`
	Events []EventDTO `json:"events"`
}

type BriefingOut struct {
	Date          string     `json:"date"`
	Events        []EventDTO `json:"events"`
	PendingChores []string   `json:"pendingChores"`
	OpenTodos     []string   `json:"openTodos"`
}

type AddEventIn struct {
	Title            string   `json:"title" jsonschema:"event title"`
	Start            string   `json:"start" jsonschema:"start time, RFC3339"`
	End              string   `json:"end" jsonschema:"end time, RFC3339"`
	AllDay           bool     `json:"allDay,omitempty"`
	AttendeeIDs      []string `json:"attendeeIds,omitempty" jsonschema:"family member ids"`
	RequiresGuardian bool     `json:"requiresGuardian,omitempty"`
	CalendarSourceID string   `json:"calendarSourceId,omitempty" jsonschema:"owning calendar id; defaults to the single attendee's calendar, else the family calendar"`
}

type AddEventOut struct {
	ID               string `json:"id"`
	AssignedGuardian string `json:"assignedGuardianId,omitempty"`
	Conflict         string `json:"conflictStatus"`
}

type AddTodoIn struct {
	Title            string `json:"title" jsonschema:"to-do title"`
	AssignedMemberID string `json:"assignedMemberId,omitempty"`
}

type IDOut struct {
	ID string `json:"id"`
}

type CompleteTodoIn struct {
	TodoID string `json:"todoId" jsonschema:"id of the to-do to complete"`
}

type CompleteChoreIn struct {
	InstanceID string `json:"instanceId" jsonschema:"id of the chore instance to complete"`
	MemberID   string `json:"memberId,omitempty"`
}

type StatusOut struct {
	Status string `json:"status"`
}

type AvailabilityIn struct {
	From string `json:"from" jsonschema:"window start, RFC3339"`
	To   string `json:"to" jsonschema:"window end, RFC3339"`
}

type MemberAvail struct {
	MemberID string `json:"memberId"`
	Name     string `json:"name"`
	Free     bool   `json:"free"`
	Reason   string `json:"reason,omitempty"`
}

type AvailabilityOut struct {
	Members []MemberAvail `json:"members"`
}

// ===== Implementations =====

// Today lists today's family events.
func (d *Deps) Today() (TodayOut, error) {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	evs, err := d.eventsBetween(start, start.AddDate(0, 0, 1))
	return TodayOut{Date: start.Format("2006-01-02"), Events: evs}, err
}

// Briefing is today's events plus pending chores and open to-dos.
func (d *Deps) Briefing() BriefingOut {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.AddDate(0, 0, 1)

	evs, _ := d.eventsBetween(start, end)
	out := BriefingOut{Date: start.Format("2006-01-02"), Events: evs, PendingChores: []string{}, OpenTodos: []string{}}

	instances, _ := d.chores.ListInstances(start, end)
	for _, ci := range instances {
		if ci.Status == "pending" {
			out.PendingChores = append(out.PendingChores, ci.Title)
		}
	}
	allTodos, _ := d.todos.List()
	for _, t := range allTodos {
		if t.Status == "open" {
			out.OpenTodos = append(out.OpenTodos, t.Title)
		}
	}
	return out
}

// AddEvent creates a calendar event, picking the owning calendar from the
// attendees when none is given.
func (d *Deps) AddEvent(ctx context.Context, in AddEventIn) (AddEventOut, error) {
	src := in.CalendarSourceID
	if src == "" {
		src = d.sourceForAttendees(in.AttendeeIDs)
	}
	if src == "" {
		return AddEventOut{}, errors.New("no calendar configured (calendars require a Radicale backend)")
	}
	ev, err := d.events.CreateEvent(ctx, calendar.NewEvent{
		CalendarSourceID: src, Title: in.Title, StartAt: in.Start, EndAt: in.End,
		AllDay: in.AllDay, AttendeeIDs: in.AttendeeIDs, RequiresGuardian: in.RequiresGuardian,
	})
	if err != nil {
		return AddEventOut{}, err
	}
	out := AddEventOut{ID: ev.ID, Conflict: ev.ConflictStatus}
	if ev.AssignedGuardianID != nil {
		out.AssignedGuardian = *ev.AssignedGuardianID
	}
	return out, nil
}

// AddTodo adds a to-do item.
func (d *Deps) AddTodo(in AddTodoIn) (IDOut, error) {
	var member *string
	if in.AssignedMemberID != "" {
		member = &in.AssignedMemberID
	}
	t, err := d.todos.Create(todos.NewTodo{Title: in.Title, AssignedMemberID: member})
	if err != nil {
		return IDOut{}, err
	}
	return IDOut{ID: t.ID}, nil
}

// CompleteTodo marks a to-do done.
func (d *Deps) CompleteTodo(in CompleteTodoIn) (StatusOut, error) {
	if _, err := d.todos.SetStatus(in.TodoID, "done"); err != nil {
		return StatusOut{}, err
	}
	return StatusOut{Status: "done"}, nil
}

// CompleteChore marks a chore instance done and reprojects the Chores calendar.
func (d *Deps) CompleteChore(ctx context.Context, in CompleteChoreIn) (StatusOut, error) {
	if err := d.chores.SetStatus(in.InstanceID, "done", in.MemberID); err != nil {
		return StatusOut{}, err
	}
	d.reprojectChores(ctx)
	return StatusOut{Status: "done"}, nil
}

// CheckAvailability reports which members are free in [from, to).
func (d *Deps) CheckAvailability(in AvailabilityIn) (AvailabilityOut, error) {
	return d.availability(in.From, in.To)
}

// ===== Guardrail lookups (used by the chat surface for child profiles) =====

// ChoreInstanceAssignee returns the assigned member id of a chore instance
// ("" when unassigned); ok=false when the instance doesn't exist.
func (d *Deps) ChoreInstanceAssignee(instanceID string) (memberID string, ok bool) {
	var assigned sql.NullString
	err := d.db.QueryRow(`SELECT assigned_member_id FROM chore_instance WHERE id = ?`, instanceID).Scan(&assigned)
	if err != nil {
		return "", false
	}
	return assigned.String, true
}

// TodoAssignee returns the assigned member id of a todo ("" when family-wide);
// ok=false when the todo doesn't exist.
func (d *Deps) TodoAssignee(todoID string) (memberID string, ok bool) {
	var assigned sql.NullString
	err := d.db.QueryRow(`SELECT assigned_member_id FROM todo WHERE id = ?`, todoID).Scan(&assigned)
	if err != nil {
		return "", false
	}
	return assigned.String, true
}

// MemberRole returns the role of a family member ("" when unknown).
func (d *Deps) MemberRole(memberID string) string {
	var role string
	_ = d.db.QueryRow(`SELECT role FROM family_member WHERE id = ?`, memberID).Scan(&role)
	return role
}

// Members lists the family members (for chat system-prompt grounding).
func (d *Deps) Members() ([]family.Member, error) { return d.family.ListMembers() }

// reprojectChores mirrors the just-changed chore status onto Radicale so
// external subscribers see it, matching the REST handler. Best-effort.
func (d *Deps) reprojectChores(ctx context.Context) {
	if d.choreProj != nil && d.choreProj.RadicaleEnabled() {
		_ = d.choreProj.ProjectChores(ctx)
	}
}

// Package mcp exposes Tribo's services to AI assistants over the Model Context
// Protocol. Tools are thin wrappers over the same service layer the REST API
// uses — no duplicated business logic.
package mcp

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tribo/internal/calendar"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/todos"
)

type deps struct {
	db        *sql.DB
	events    *calendar.Service
	chores    *chores.Service
	todos     *todos.Service
	family    *family.Service
	choreProj choreProjector
}

// choreProjector refreshes the Radicale Chores collection after a status change.
// Implemented by *calsync.Engine; the MCP path uses it to stay consistent with
// the REST path (which calls Server.reprojectChores).
type choreProjector interface {
	RadicaleEnabled() bool
	ProjectChores(ctx context.Context) error
}

// reprojectChores mirrors the just-changed chore status onto Radicale so external
// subscribers see it, matching the REST handler. Best-effort, no-op without Radicale.
func (d *deps) reprojectChores(ctx context.Context) {
	if d.choreProj != nil && d.choreProj.RadicaleEnabled() {
		_ = d.choreProj.ProjectChores(ctx)
	}
}

// NewServer builds the MCP server with all of Tribo's tools registered. backend
// is the CalDAV system of record (calsync.Engine) so MCP-created events are
// written to Radicale like the REST path; pass nil for cache-only use (tests).
func NewServer(db *sql.DB, backend calendar.EventBackend) *mcp.Server {
	d := &deps{
		db:     db,
		events: calendar.NewService(db, backend),
		chores: chores.NewService(db),
		todos:  todos.NewService(db),
		family: family.NewService(db),
	}
	if cp, ok := backend.(choreProjector); ok {
		d.choreProj = cp
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "tribo", Version: "0.1.0"}, nil)
	d.register(server)
	return server
}

// NewHandler returns an HTTP handler to mount at /mcp.
func NewHandler(db *sql.DB, backend calendar.EventBackend) http.Handler {
	server := NewServer(db, backend)
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)
}

// ===== Tool I/O types =====

type empty struct{}

type eventDTO struct {
	Title  string `json:"title"`
	Start  string `json:"start"`
	End    string `json:"end"`
	Person string `json:"person"`
}

type todayOut struct {
	Date   string     `json:"date"`
	Events []eventDTO `json:"events"`
}

type briefingOut struct {
	Date          string     `json:"date"`
	Events        []eventDTO `json:"events"`
	PendingChores []string   `json:"pendingChores"`
	OpenTodos     []string   `json:"openTodos"`
}

type addEventIn struct {
	Title            string   `json:"title" jsonschema:"event title"`
	Start            string   `json:"start" jsonschema:"start time, RFC3339"`
	End              string   `json:"end" jsonschema:"end time, RFC3339"`
	AllDay           bool     `json:"allDay,omitempty"`
	AttendeeIDs      []string `json:"attendeeIds,omitempty" jsonschema:"family member ids"`
	RequiresGuardian bool     `json:"requiresGuardian,omitempty"`
	CalendarSourceID string   `json:"calendarSourceId,omitempty" jsonschema:"owning calendar id; defaults to the single attendee's calendar, else the family calendar"`
}
type addEventOut struct {
	ID               string `json:"id"`
	AssignedGuardian string `json:"assignedGuardianId,omitempty"`
	Conflict         string `json:"conflictStatus"`
}

type addTodoIn struct {
	Title            string `json:"title" jsonschema:"to-do title"`
	AssignedMemberID string `json:"assignedMemberId,omitempty"`
}
type idOut struct {
	ID string `json:"id"`
}

type completeTodoIn struct {
	TodoID string `json:"todoId" jsonschema:"id of the to-do to complete"`
}
type completeChoreIn struct {
	InstanceID string `json:"instanceId" jsonschema:"id of the chore instance to complete"`
	MemberID   string `json:"memberId,omitempty"`
}
type statusOut struct {
	Status string `json:"status"`
}

type availabilityIn struct {
	From string `json:"from" jsonschema:"window start, RFC3339"`
	To   string `json:"to" jsonschema:"window end, RFC3339"`
}
type memberAvail struct {
	MemberID string `json:"memberId"`
	Name     string `json:"name"`
	Free     bool   `json:"free"`
	Reason   string `json:"reason,omitempty"`
}
type availabilityOut struct {
	Members []memberAvail `json:"members"`
}

// ===== Registration =====

func (d *deps) register(s *mcp.Server) {
	mcp.AddTool(s, &mcp.Tool{Name: "get_today", Description: "List today's family events."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, todayOut, error) {
			now := time.Now()
			start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			evs, err := d.eventsBetween(start, start.AddDate(0, 0, 1))
			return nil, todayOut{Date: start.Format("2006-01-02"), Events: evs}, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_briefing", Description: "Today's events plus pending chores and open to-dos."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, briefingOut, error) {
			return nil, d.briefing(), nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_event", Description: "Create a calendar event. Returns guardian assignment if applicable."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in addEventIn) (*mcp.CallToolResult, addEventOut, error) {
			src := in.CalendarSourceID
			if src == "" {
				src = d.sourceForAttendees(in.AttendeeIDs)
			}
			if src == "" {
				return nil, addEventOut{}, errors.New("no calendar configured (calendars require a Radicale backend)")
			}
			ev, err := d.events.CreateEvent(ctx, calendar.NewEvent{
				CalendarSourceID: src, Title: in.Title, StartAt: in.Start, EndAt: in.End,
				AllDay: in.AllDay, AttendeeIDs: in.AttendeeIDs, RequiresGuardian: in.RequiresGuardian,
			})
			if err != nil {
				return nil, addEventOut{}, err
			}
			out := addEventOut{ID: ev.ID, Conflict: ev.ConflictStatus}
			if ev.AssignedGuardianID != nil {
				out.AssignedGuardian = *ev.AssignedGuardianID
			}
			return nil, out, nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_todo", Description: "Add a to-do item."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in addTodoIn) (*mcp.CallToolResult, idOut, error) {
			var member *string
			if in.AssignedMemberID != "" {
				member = &in.AssignedMemberID
			}
			t, err := d.todos.Create(todos.NewTodo{Title: in.Title, AssignedMemberID: member})
			if err != nil {
				return nil, idOut{}, err
			}
			return nil, idOut{ID: t.ID}, nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "complete_todo", Description: "Mark a to-do done."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in completeTodoIn) (*mcp.CallToolResult, statusOut, error) {
			if _, err := d.todos.SetStatus(in.TodoID, "done"); err != nil {
				return nil, statusOut{}, err
			}
			return nil, statusOut{Status: "done"}, nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "complete_chore", Description: "Mark a chore instance done."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in completeChoreIn) (*mcp.CallToolResult, statusOut, error) {
			if err := d.chores.SetStatus(in.InstanceID, "done", in.MemberID); err != nil {
				return nil, statusOut{}, err
			}
			d.reprojectChores(ctx)
			return nil, statusOut{Status: "done"}, nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "check_availability", Description: "Who is free in a time window (events + work schedules)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in availabilityIn) (*mcp.CallToolResult, availabilityOut, error) {
			out, err := d.availability(in.From, in.To)
			return nil, out, err
		})
}

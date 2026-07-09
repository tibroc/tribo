// Package mcp exposes Tribo's services to AI assistants over the Model Context
// Protocol. Each tool is a thin adapter over internal/tools — the same shared
// implementations the in-app chat assistant uses — so business logic lives once.
package mcp

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"tribo/internal/calendar"
	"tribo/internal/tools"
)

type empty struct{}

// NewServer builds the MCP server with all of Tribo's tools registered. backend
// is the CalDAV system of record (calsync.Engine) so MCP-created events are
// written to Radicale like the REST path; pass nil for cache-only use (tests).
func NewServer(db *sql.DB, backend calendar.EventBackend) *mcp.Server {
	d := tools.New(db, backend)
	server := mcp.NewServer(&mcp.Implementation{Name: "tribo", Version: "0.1.0"}, nil)
	register(server, d)
	return server
}

// NewHandler returns an HTTP handler to mount at /mcp.
func NewHandler(db *sql.DB, backend calendar.EventBackend) http.Handler {
	server := NewServer(db, backend)
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)
}

func register(s *mcp.Server, d *tools.Deps) {
	mcp.AddTool(s, &mcp.Tool{Name: "get_today", Description: "List today's family events."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, tools.TodayOut, error) {
			out, err := d.Today()
			return nil, out, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "get_briefing", Description: "Today's events plus pending chores and open to-dos."},
		func(ctx context.Context, _ *mcp.CallToolRequest, _ empty) (*mcp.CallToolResult, tools.BriefingOut, error) {
			return nil, d.Briefing(), nil
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_event", Description: "Create a calendar event. Returns guardian assignment if applicable."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in tools.AddEventIn) (*mcp.CallToolResult, tools.AddEventOut, error) {
			out, err := d.AddEvent(ctx, in)
			return nil, out, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "add_todo", Description: "Add a to-do item."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in tools.AddTodoIn) (*mcp.CallToolResult, tools.IDOut, error) {
			out, err := d.AddTodo(in)
			return nil, out, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "complete_todo", Description: "Mark a to-do done."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in tools.CompleteTodoIn) (*mcp.CallToolResult, tools.StatusOut, error) {
			out, err := d.CompleteTodo(in)
			return nil, out, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "complete_chore", Description: "Mark a chore instance done."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in tools.CompleteChoreIn) (*mcp.CallToolResult, tools.StatusOut, error) {
			out, err := d.CompleteChore(ctx, in)
			return nil, out, err
		})

	mcp.AddTool(s, &mcp.Tool{Name: "check_availability", Description: "Who is free in a time window (events + work schedules)."},
		func(ctx context.Context, _ *mcp.CallToolRequest, in tools.AvailabilityIn) (*mcp.CallToolResult, tools.AvailabilityOut, error) {
			out, err := d.CheckAvailability(in)
			return nil, out, err
		})
}

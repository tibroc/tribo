// Package api exposes the REST handlers. Handlers are thin: they parse/serialize
// and delegate to the calendar/chores/todos/family services.
package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"

	"tribo/internal/calendar"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/todos"
)

type Server struct {
	events *calendar.Service
	chores *chores.Service
	todos  *todos.Service
	family *family.Service
}

// NewHandler builds the full HTTP handler: /api/* routes plus the embedded SPA
// served (with index.html fallback) for everything else. Pass a nil/empty
// webFS to serve the API only (e.g. `go run` during frontend dev).
func NewHandler(db *sql.DB, webFS fs.FS) http.Handler {
	s := &Server{
		events: calendar.NewService(db),
		chores: chores.NewService(db),
		todos:  todos.NewService(db),
		family: family.NewService(db),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/events", s.listEvents)
	mux.HandleFunc("POST /api/events", s.createEvent)
	mux.HandleFunc("GET /api/family-members", s.listFamilyMembers)
	mux.HandleFunc("GET /api/work-schedules", s.listWorkSchedules)

	mux.HandleFunc("GET /api/chores", s.listChores)
	mux.HandleFunc("POST /api/chores", s.createChore)
	mux.HandleFunc("GET /api/chore-instances", s.listChoreInstances)
	// {id} is a chore_instance id (matches the documented MCP-facing surface).
	mux.HandleFunc("POST /api/chores/{id}/complete", s.completeChore)
	mux.HandleFunc("POST /api/chores/{id}/skip", s.skipChore)
	// Full status control for the UI checkbox toggle (done ↔ pending ↔ skipped).
	mux.HandleFunc("PATCH /api/chore-instances/{id}", s.patchChoreInstance)

	mux.HandleFunc("GET /api/todos", s.listTodos)
	mux.HandleFunc("POST /api/todos", s.createTodo)
	mux.HandleFunc("PATCH /api/todos/{id}", s.patchTodo)

	mux.HandleFunc("GET /api/briefing", s.getBriefing)
	mux.HandleFunc("GET /api/review", s.getReview)

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	if webFS != nil {
		mux.Handle("/", spaHandler(webFS))
	}
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

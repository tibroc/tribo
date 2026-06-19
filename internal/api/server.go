// Package api exposes the REST handlers. Handlers are thin: they parse/serialize
// and delegate to the calendar/chores/todos/family services.
package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"

	"tribo/internal/auth"
	"tribo/internal/calendar"
	"tribo/internal/calsync"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/mcp"
	"tribo/internal/todos"
	"tribo/internal/weather"
)

type Server struct {
	db      *sql.DB
	events  *calendar.Service
	chores  *chores.Service
	todos   *todos.Service
	family  *family.Service
	weather *weather.Service
	sync    *calsync.Engine
}

// NewHandler builds the full HTTP handler: open auth/session routes, the
// auth-protected /api/* surface, and the embedded SPA (index.html fallback) for
// everything else. Pass a nil/empty webFS to serve the API only.
func NewHandler(db *sql.DB, webFS fs.FS, authSvc *auth.Service, syncEngine *calsync.Engine) http.Handler {
	s := &Server{
		db:      db,
		events:  calendar.NewService(db, syncEngine),
		chores:  chores.NewService(db),
		todos:   todos.NewService(db),
		family:  family.NewService(db),
		weather: weather.NewService(db),
		sync:    syncEngine,
	}

	// Protected API surface.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/events", s.listEvents)
	mux.HandleFunc("POST /api/events", s.createEvent)
	mux.HandleFunc("PATCH /api/events/{id}", s.updateEvent)
	mux.HandleFunc("DELETE /api/events/{id}", s.deleteEvent)
	mux.HandleFunc("GET /api/events/{id}/guardians", s.eventGuardians)
	mux.HandleFunc("POST /api/events/{id}/claim", s.claimEvent)
	mux.HandleFunc("GET /api/family-members", s.listFamilyMembers)
	mux.HandleFunc("POST /api/family-members", s.createFamilyMember)
	mux.HandleFunc("PATCH /api/family-members/{id}", s.updateFamilyMember)
	mux.HandleFunc("DELETE /api/family-members/{id}", s.deleteFamilyMember)
	mux.HandleFunc("GET /api/work-schedules", s.listWorkSchedules)
	mux.HandleFunc("POST /api/work-schedules", s.createWorkSchedule)
	mux.HandleFunc("PATCH /api/work-schedules/{id}", s.patchWorkSchedule)
	mux.HandleFunc("DELETE /api/work-schedules/{id}", s.deleteWorkSchedule)
	mux.HandleFunc("GET /api/calendar-status", s.calendarStatus)
	mux.HandleFunc("GET /api/calendar-sources", s.listCalendarSources)
	mux.HandleFunc("POST /api/calendar-sources", s.createCalendarSource)
	mux.HandleFunc("GET /api/calendar-sources/google/connect", s.googleConnect)
	mux.HandleFunc("DELETE /api/calendar-sources/{id}", s.deleteCalendarSource)
	mux.HandleFunc("POST /api/calendar-sources/{id}/sync", s.syncCalendarSource)

	mux.HandleFunc("GET /api/chores", s.listChores)
	mux.HandleFunc("POST /api/chores", s.createChore)
	mux.HandleFunc("PATCH /api/chores/{id}", s.updateChore)
	mux.HandleFunc("DELETE /api/chores/{id}", s.deleteChore)
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
	mux.HandleFunc("GET /api/notifications", s.listNotifications)

	mux.HandleFunc("GET /api/weather", s.getWeather)
	mux.HandleFunc("GET /api/weather/settings", s.getWeatherSettings)
	mux.HandleFunc("PATCH /api/weather/settings", s.updateWeatherSettings)
	mux.HandleFunc("GET /api/weather/geocode", s.geocodeWeather)

	mux.HandleFunc("POST /api/onboarding", s.handleOnboarding)

	// Root mux: open routes first (more specific patterns win), then the
	// protected /api/ subtree, then the SPA.
	root := http.NewServeMux()
	authSvc.RegisterRoutes(root) // /auth/*, /api/session*
	root.HandleFunc("GET /auth/google/callback", s.googleCallback) // Google Calendar OAuth (open)
	root.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	root.Handle("/api/", authSvc.Protect(mux))

	// MCP server (open in dev; protect behind a token/proxy in production).
	mcpHandler := mcp.NewHandler(db)
	root.Handle("/mcp", mcpHandler)
	root.Handle("/mcp/", mcpHandler)

	if webFS != nil {
		root.Handle("/", spaHandler(webFS))
	}
	return root
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// Package api exposes the REST handlers. Handlers are thin: they parse/serialize
// and delegate to the calendar/family services.
package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

type Server struct {
	events *calendar.Service
	family *family.Service
}

// NewHandler builds the full HTTP handler: /api/* routes plus the embedded SPA
// served (with index.html fallback) for everything else. Pass a nil/empty
// webFS to serve the API only (e.g. `go run` during frontend dev).
func NewHandler(db *sql.DB, webFS fs.FS) http.Handler {
	s := &Server{
		events: calendar.NewService(db),
		family: family.NewService(db),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/events", s.listEvents)
	mux.HandleFunc("POST /api/events", s.createEvent)
	mux.HandleFunc("GET /api/family-members", s.listFamilyMembers)
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

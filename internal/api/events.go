package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/calsync"
)

// GET /api/events?from=<RFC3339>&to=<RFC3339>
// Both query params are optional; omitting them returns all events.
func (s *Server) listEvents(w http.ResponseWriter, r *http.Request) {
	var from, to time.Time
	if v := r.URL.Query().Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "from must be RFC3339")
			return
		}
		from = t
	}
	if v := r.URL.Query().Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "to must be RFC3339")
			return
		}
		to = t
	}

	events, err := s.events.ListEvents(from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, events)
}

// POST /api/events
func (s *Server) createEvent(w http.ResponseWriter, r *http.Request) {
	var in calendar.NewEvent
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ev, err := s.events.CreateEvent(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.pushIfExternal(ev.ID)
	writeJSON(w, http.StatusCreated, ev)
}

// pushIfExternal writes an event to its CalDAV source in the background.
// PushEvent itself no-ops for internal/read-only sources.
func (s *Server) pushIfExternal(eventID string) {
	go func() {
		if err := s.sync.PushEvent(context.Background(), eventID); err != nil {
			log.Printf("calsync push %s: %v", eventID, err)
		}
	}()
}

func (s *Server) listCalendarSources(w http.ResponseWriter, _ *http.Request) {
	srcs, err := s.events.ListSources()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, srcs)
}

// POST /api/calendar-sources — connect an external calendar, then sync it once.
func (s *Server) createCalendarSource(w http.ResponseWriter, r *http.Request) {
	var in calsync.NewSource
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	id, err := s.sync.CreateSource(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Initial sync in the background so the request returns promptly.
	go func() { _ = s.sync.SyncSourceByID(context.Background(), id) }()
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// DELETE /api/calendar-sources/{id}
func (s *Server) deleteCalendarSource(w http.ResponseWriter, r *http.Request) {
	if err := s.sync.DeleteSource(r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// POST /api/calendar-sources/{id}/sync — pull now.
func (s *Server) syncCalendarSource(w http.ResponseWriter, r *http.Request) {
	if err := s.sync.SyncSourceByID(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "synced"})
}

// PATCH /api/events/{id} — full replace of the event's editable fields.
func (s *Server) updateEvent(w http.ResponseWriter, r *http.Request) {
	var in calendar.NewEvent
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ev, err := s.events.UpdateEvent(r.PathValue("id"), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.pushIfExternal(ev.ID)
	writeJSON(w, http.StatusOK, ev)
}

// DELETE /api/events/{id}
func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	if err := s.events.DeleteEvent(r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

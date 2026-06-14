package api

import (
	"encoding/json"
	"net/http"
	"time"

	"tribo/internal/calendar"
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
	writeJSON(w, http.StatusCreated, ev)
}

func (s *Server) listCalendarSources(w http.ResponseWriter, _ *http.Request) {
	srcs, err := s.events.ListSources()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, srcs)
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

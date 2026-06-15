package api

import (
	"encoding/json"
	"net/http"

	"tribo/internal/todos"
)

func (s *Server) listTodos(w http.ResponseWriter, _ *http.Request) {
	ts, err := s.todos.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ts)
}

func (s *Server) createTodo(w http.ResponseWriter, r *http.Request) {
	var in todos.NewTodo
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	t, err := s.todos.Create(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// PATCH /api/todos/{id} — body {"status":"open"|"done"}.
func (s *Server) patchTodo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	t, err := s.todos.SetStatus(r.PathValue("id"), body.Status)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) listWorkSchedules(w http.ResponseWriter, _ *http.Request) {
	ws, err := s.family.ListWorkSchedules()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

// PATCH /api/work-schedules/{id} — body {"showOnCalendar":bool}.
func (s *Server) patchWorkSchedule(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ShowOnCalendar bool `json:"showOnCalendar"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := s.family.SetWorkScheduleVisibility(r.PathValue("id"), body.ShowOnCalendar); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"showOnCalendar": body.ShowOnCalendar})
}

package api

import (
	"encoding/json"
	"net/http"

	"tribo/internal/family"
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

// PATCH /api/todos/{id} — body may set {"status":"open"|"done"} and/or
// {"assignedMemberId": "<id>"|""} (empty string clears the assignment).
// A nil pointer means "leave unchanged", so status-only and assignee-only
// patches both work.
func (s *Server) patchTodo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status           *string `json:"status"`
		AssignedMemberID *string `json:"assignedMemberId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	t, err := s.todos.Patch(r.PathValue("id"), body.Status, body.AssignedMemberID)
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

// PATCH /api/work-schedules/{id} — toggles showOnCalendar, or replaces the
// whole schedule when a full WorkScheduleInput (with memberId) is sent.
func (s *Server) patchWorkSchedule(w http.ResponseWriter, r *http.Request) {
	var in family.WorkScheduleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if in.MemberID == "" {
		// Visibility-only toggle.
		if err := s.family.SetWorkScheduleVisibility(r.PathValue("id"), in.ShowOnCalendar); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"showOnCalendar": in.ShowOnCalendar})
		return
	}
	ws, err := s.family.UpdateWorkSchedule(r.PathValue("id"), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func (s *Server) createWorkSchedule(w http.ResponseWriter, r *http.Request) {
	var in family.WorkScheduleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	ws, err := s.family.AddWorkSchedule(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

func (s *Server) deleteWorkSchedule(w http.ResponseWriter, r *http.Request) {
	if err := s.family.DeleteWorkSchedule(r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

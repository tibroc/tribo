package api

import (
	"encoding/json"
	"net/http"
	"time"

	"tribo/internal/chores"
)

func (s *Server) listChores(w http.ResponseWriter, _ *http.Request) {
	cs, err := s.chores.ListChores()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cs)
}

func (s *Server) createChore(w http.ResponseWriter, r *http.Request) {
	var in chores.NewChore
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	c, err := s.chores.CreateChore(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) updateChore(w http.ResponseWriter, r *http.Request) {
	var in chores.NewChore
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	c, err := s.chores.UpdateChore(r.PathValue("id"), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) deleteChore(w http.ResponseWriter, r *http.Request) {
	if err := s.chores.DeleteChore(r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// GET /api/chore-instances?from=&to= (date-only YYYY-MM-DD, or RFC3339).
func (s *Server) listChoreInstances(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseDateRange(r, 7)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	is, err := s.chores.ListInstances(from, to)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, is)
}

func (s *Server) completeChore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MemberID string `json:"memberId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if err := s.chores.SetStatus(r.PathValue("id"), "done", body.MemberID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "done"})
}

func (s *Server) skipChore(w http.ResponseWriter, r *http.Request) {
	if err := s.chores.SetStatus(r.PathValue("id"), "skipped", ""); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "skipped"})
}

// PATCH /api/chore-instances/{id} — body {"status":"pending|done|skipped","memberId":"..."}.
func (s *Server) patchChoreInstance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status   string `json:"status"`
		MemberID string `json:"memberId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := s.chores.SetStatus(r.PathValue("id"), body.Status, body.MemberID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": body.Status})
}

// parseDateRange reads ?from/?to (date-only or RFC3339); defaults to a window of
// `defaultDays` starting today when absent.
func parseDateRange(r *http.Request, defaultDays int) (time.Time, time.Time, error) {
	parse := func(v string) (time.Time, error) {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			return t, nil
		}
		return time.Parse(time.RFC3339, v)
	}
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	to := from.AddDate(0, 0, defaultDays)
	if v := r.URL.Query().Get("from"); v != "" {
		t, err := parse(v)
		if err != nil {
			return from, to, errFromBad
		}
		from = t
	}
	if v := r.URL.Query().Get("to"); v != "" {
		t, err := parse(v)
		if err != nil {
			return from, to, errToBad
		}
		to = t
	}
	return from, to, nil
}

var (
	errFromBad = &apiError{"from must be a date or RFC3339"}
	errToBad   = &apiError{"to must be a date or RFC3339"}
)

type apiError struct{ msg string }

func (e *apiError) Error() string { return e.msg }

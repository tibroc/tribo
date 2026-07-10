package api

import (
	"encoding/json"
	"net/http"
)

// GET /api/focus[?all=1] — the Now/Next/Later queue for the acting profile
// (deterministic ranking; see internal/focus). all=1 includes the hidden tail.
func (s *Server) getFocus(w http.ResponseWriter, r *http.Request) {
	q, err := s.focus.BuildQueue(s.auth.ActiveMemberID(r), r.URL.Query().Get("all") == "1")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, q)
}

// POST /api/focus/defer {"kind":"todo"|"chore"|"event","id":"…"} — guilt-free
// "not now": hides the item for the rest of the day and logs it for Review.
func (s *Server) deferFocusItem(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind string `json:"kind"`
		ID   string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := s.focus.Defer(body.Kind, body.ID, s.auth.ActiveMemberID(r)); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deferred"})
}

package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"tribo/internal/assistant"
)

// GET /api/assistant/status — whether an LLM backend is configured (drives UI
// gating) and which model. Never exposes the base URL or key.
func (s *Server) assistantStatus(w http.ResponseWriter, _ *http.Request) {
	if !s.assistant.Enabled() {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "model": s.assistant.Model()})
}

// GET /api/assistant/brief?kind=day|week — the cached brief for the current
// period. 404 when none exists yet (the card offers Generate).
func (s *Server) assistantBrief(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	if kind == "" {
		kind = "day"
	}
	b, err := s.assistant.Latest(kind)
	switch {
	case errors.Is(err, assistant.ErrDisabled):
		writeError(w, http.StatusNotFound, "assistant not configured")
	case errors.Is(err, assistant.ErrNoBrief):
		writeError(w, http.StatusNotFound, "no brief for this period yet")
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
	default:
		writeJSON(w, http.StatusOK, b)
	}
}

// POST /api/assistant/brief/refresh {"kind":"day"|"week"} — regenerate now
// (rate-limited to once a minute per kind).
func (s *Server) assistantRefresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Kind string `json:"kind"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Kind == "" {
		body.Kind = "day"
	}
	b, err := s.assistant.Refresh(r.Context(), body.Kind)
	switch {
	case errors.Is(err, assistant.ErrDisabled):
		writeError(w, http.StatusNotFound, "assistant not configured")
	case errors.Is(err, assistant.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, err.Error())
	case err != nil:
		writeError(w, http.StatusBadGateway, err.Error())
	default:
		writeJSON(w, http.StatusOK, b)
	}
}

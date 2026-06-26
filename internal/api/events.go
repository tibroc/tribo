package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/calsync"
)

const gcalStateCookie = "tribo_gcal_state"
const gcalMemberCookie = "tribo_gcal_member"

// eventErrorStatus maps calendar service errors to HTTP status codes: bad client
// input → 400, a missing event → 404, anything else (CalDAV/backend) → 502.
func eventErrorStatus(err error) int {
	var ve calendar.ValidationError
	switch {
	case errors.As(err, &ve):
		return http.StatusBadRequest
	case errors.Is(err, calendar.ErrNotFound):
		return http.StatusNotFound
	default:
		return http.StatusBadGateway
	}
}

// GET /api/calendar-sources/google/connect?memberId=… — returns the Google
// consent URL. A Google calendar is a read-only overlay for one member, so the
// chosen member is stashed in a cookie to survive the OAuth round-trip.
func (s *Server) googleConnect(w http.ResponseWriter, r *http.Request) {
	if !s.sync.GoogleEnabled() {
		writeError(w, http.StatusBadRequest, "Google sync is not configured on this server")
		return
	}
	memberID := r.URL.Query().Get("memberId")
	if memberID == "" {
		writeError(w, http.StatusBadRequest, "memberId is required (a Google calendar belongs to one person)")
		return
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := base64.RawURLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{Name: gcalStateCookie, Value: state, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	http.SetCookie(w, &http.Cookie{Name: gcalMemberCookie, Value: memberID, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	url, err := s.sync.GoogleAuthURL(state)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"authUrl": url})
}

// GET /auth/google/callback — open route; exchanges the code and stores the source.
func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) {
	st, err := r.Cookie(gcalStateCookie)
	if err != nil || st.Value == "" || st.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: gcalStateCookie, Value: "", Path: "/", MaxAge: -1})
	memberID := ""
	if mc, err := r.Cookie(gcalMemberCookie); err == nil {
		memberID = mc.Value
	}
	http.SetCookie(w, &http.Cookie{Name: gcalMemberCookie, Value: "", Path: "/", MaxAge: -1})
	id, err := s.sync.ConnectGoogle(r.Context(), r.URL.Query().Get("code"), "Google Calendar", memberID)
	if err != nil {
		http.Error(w, "google connect failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	go func() { _ = s.sync.SyncSourceByID(context.Background(), id) }()
	http.Redirect(w, r, "/", http.StatusFound)
}

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

	// Pull the requested range into the cache on demand if it falls outside the
	// currently-synced window (so navigating to a distant month/year works).
	s.sync.EnsureWindow(r.Context(), from, to)

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
	ev, err := s.events.CreateEvent(r.Context(), in)
	if err != nil {
		writeError(w, eventErrorStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, ev)
}

// GET /api/calendar-status — whether the Radicale backend is configured and
// currently reachable, so the UI can surface a "calendars unavailable" banner.
func (s *Server) calendarStatus(w http.ResponseWriter, r *http.Request) {
	enabled := s.sync.RadicaleEnabled()
	writeJSON(w, http.StatusOK, map[string]bool{
		"enabled":   enabled,
		"reachable": enabled && s.sync.RadicaleReachable(r.Context()),
	})
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
	ev, err := s.events.UpdateEvent(r.Context(), r.PathValue("id"), in)
	if err != nil {
		writeError(w, eventErrorStatus(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ev)
}

// GET /api/events/{id}/guardians — free guardians who could claim this event.
func (s *Server) eventGuardians(w http.ResponseWriter, r *http.Request) {
	free, err := s.events.FreeGuardians(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"free": free})
}

// POST /api/events/{id}/claim — body {"memberId":"...","force":bool}.
func (s *Server) claimEvent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MemberID string `json:"memberId"`
		Force    bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := s.events.Claim(r.PathValue("id"), body.MemberID, body.Force); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"assignedGuardianId": body.MemberID})
}

// DELETE /api/events/{id}
func (s *Server) deleteEvent(w http.ResponseWriter, r *http.Request) {
	if err := s.events.DeleteEvent(r.Context(), r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

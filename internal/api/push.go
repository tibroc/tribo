package api

import (
	"encoding/json"
	"net/http"
)

// GET /api/push/status — whether push is available (VAPID keys exist), the
// public key the browser needs to subscribe, and whether the calling device's
// endpoint is already registered (endpoint passed as a query param since the
// client knows it).
func (s *Server) pushStatus(w http.ResponseWriter, r *http.Request) {
	if !s.push.Enabled() {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	out := map[string]any{"enabled": true, "publicKey": s.push.PublicKey()}
	if ep := r.URL.Query().Get("endpoint"); ep != "" {
		out["subscribed"] = s.push.HasSubscription(ep)
	}
	writeJSON(w, http.StatusOK, out)
}

// POST /api/push/subscriptions — register this browser's subscription for the
// active profile. Standard PushSubscription.toJSON() shape.
func (s *Server) pushSubscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	member := s.auth.ActiveMemberID(r)
	if member == "" {
		writeError(w, http.StatusBadRequest, "select a profile first — notifications are per person")
		return
	}
	if err := s.push.Subscribe(member, body.Endpoint, body.Keys.P256dh, body.Keys.Auth); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "subscribed"})
}

// DELETE /api/push/subscriptions {"endpoint": "…"} — remove this device.
func (s *Server) pushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "endpoint required")
		return
	}
	if err := s.push.Unsubscribe(body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "unsubscribed"})
}

// GET /api/push/prefs — the active profile's notification preferences.
func (s *Server) pushGetPrefs(w http.ResponseWriter, r *http.Request) {
	member := s.auth.ActiveMemberID(r)
	if member == "" {
		writeError(w, http.StatusBadRequest, "select a profile first")
		return
	}
	writeJSON(w, http.StatusOK, s.push.GetPrefs(member))
}

// PATCH /api/push/prefs — save the active profile's preferences (the client
// includes its UI language so server-sent notification text matches).
func (s *Server) pushSetPrefs(w http.ResponseWriter, r *http.Request) {
	member := s.auth.ActiveMemberID(r)
	if member == "" {
		writeError(w, http.StatusBadRequest, "select a profile first")
		return
	}
	var prefs = s.push.GetPrefs(member)
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := s.push.SetPrefs(member, prefs); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

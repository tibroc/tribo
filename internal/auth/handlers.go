package auth

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
)

// RegisterRoutes mounts the always-open auth + session routes (they must not sit
// behind the API auth middleware).
func (s *Service) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /auth/login", s.handleLogin)
	mux.HandleFunc("GET /auth/callback", s.handleCallback)
	mux.HandleFunc("POST /auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/session", s.handleSessionInfo)
	mux.HandleFunc("POST /api/session/profile", s.handleSwitchProfile)
	mux.HandleFunc("POST /api/session/map", s.handleMapProfile)
}

// Protect requires an authenticated session for API routes when auth is enabled.
func (s *Service) Protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.enabled {
			sess, ok := s.readSession(r)
			if !ok || sess.Sub == "" {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// ===== OIDC flow =====

func (s *Service) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.enabled {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := base64.RawURLEncoding.EncodeToString(b)
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/", HttpOnly: true, Secure: s.secure, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	http.Redirect(w, r, s.oauth.AuthCodeURL(state), http.StatusFound)
}

func (s *Service) handleCallback(w http.ResponseWriter, r *http.Request) {
	if !s.enabled {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}
	ctx := r.Context()
	st, err := r.Cookie(stateCookie)
	if err != nil || st.Value == "" || st.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid oauth state", http.StatusBadRequest)
		return
	}
	s.clearCookie(w, stateCookie)

	oauth2Token, err := s.oauth.Exchange(ctx, r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "token exchange failed", http.StatusBadGateway)
		return
	}
	rawID, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "no id_token in response", http.StatusBadGateway)
		return
	}
	idToken, err := s.verifier.Verify(ctx, rawID)
	if err != nil {
		http.Error(w, "id_token verification failed", http.StatusUnauthorized)
		return
	}

	// Map the subject to a family member (if previously claimed).
	member := s.memberForSubject(idToken.Subject)
	if member == "" {
		// First login: auto-provision a member from the user's OIDC groups.
		// Returns "" when the user is in no configured group — the frontend then
		// shows the manual map-profile screen.
		if id, err := s.provisionMember(idToken); err != nil {
			log.Printf("auth: provisioning from groups failed: %v", err)
		} else {
			member = id
		}
	}
	s.writeSession(w, session{Sub: idToken.Subject, Member: member})
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Service) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.clearCookie(w, cookieName)
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// ===== Session API =====

type memberInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
	Role   string `json:"role"`
	HasPin bool   `json:"hasPin"`
	Mapped bool   `json:"mapped"` // an oidc_subject is already attached
}

type sessionInfo struct {
	AuthEnabled    bool         `json:"authEnabled"`
	Authenticated  bool         `json:"authenticated"`
	NeedsMapping   bool         `json:"needsMapping"`
	Subject        string       `json:"subject,omitempty"`
	ActiveMemberID string       `json:"activeMemberId,omitempty"`
	Members        []memberInfo `json:"members"`
}

func (s *Service) handleSessionInfo(w http.ResponseWriter, r *http.Request) {
	members, err := s.listMembers()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sess, _ := s.readSession(r)

	info := sessionInfo{AuthEnabled: s.enabled, Members: members}
	if s.enabled {
		info.Authenticated = sess.Sub != ""
		info.Subject = sess.Sub
		info.NeedsMapping = sess.Sub != "" && sess.Member == ""
		info.ActiveMemberID = sess.Member
	} else {
		// Disabled mode: implicitly authenticated; default to the first member.
		info.Authenticated = true
		if sess.Member == "" && len(members) > 0 {
			sess.Member = members[0].ID
			s.writeSession(w, sess)
		}
		info.ActiveMemberID = sess.Member
	}
	writeJSON(w, http.StatusOK, info)
}

// POST /api/session/profile — switch active profile (PIN-gated if the member has one).
func (s *Service) handleSwitchProfile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MemberID string `json:"memberId"`
		Pin      string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	sess, _ := s.readSession(r)
	if s.enabled && sess.Sub == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}

	var pin *string
	if err := s.db.QueryRow(`SELECT pin FROM family_member WHERE id = ?`, body.MemberID).Scan(&pin); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown member"})
		return
	}
	if pin != nil && *pin != "" && *pin != body.Pin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "incorrect PIN"})
		return
	}
	sess.Member = body.MemberID
	s.writeSession(w, sess)
	writeJSON(w, http.StatusOK, map[string]string{"activeMemberId": body.MemberID})
}

// POST /api/session/map — first-login: attach the Authentik subject to a member.
func (s *Service) handleMapProfile(w http.ResponseWriter, r *http.Request) {
	if !s.enabled {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "auth disabled"})
		return
	}
	sess, _ := s.readSession(r)
	if sess.Sub == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthenticated"})
		return
	}
	var body struct {
		MemberID string `json:"memberId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	// Don't claim a member already mapped to a different subject.
	var existing *string
	if err := s.db.QueryRow(`SELECT oidc_subject FROM family_member WHERE id = ?`, body.MemberID).Scan(&existing); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unknown member"})
		return
	}
	if existing != nil && *existing != "" && *existing != sess.Sub {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "member already linked to another account"})
		return
	}
	if _, err := s.db.Exec(`UPDATE family_member SET oidc_subject = ? WHERE id = ?`, sess.Sub, body.MemberID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sess.Member = body.MemberID
	s.writeSession(w, sess)
	writeJSON(w, http.StatusOK, map[string]string{"activeMemberId": body.MemberID})
}

// AdoptMember links the current session's subject to memberID and refreshes the
// session cookie so the user is recognized as that member. It's a no-op when
// auth is disabled or the request has no authenticated subject (e.g. the
// dev/disabled onboarding path). Mirrors handleMapProfile, minus the
// already-linked-to-another-account guard (onboarding just created the member).
func (s *Service) AdoptMember(w http.ResponseWriter, r *http.Request, memberID string) error {
	if !s.enabled {
		return nil
	}
	sess, _ := s.readSession(r)
	if sess.Sub == "" {
		return nil
	}
	if _, err := s.db.Exec(`UPDATE family_member SET oidc_subject = ? WHERE id = ?`, sess.Sub, memberID); err != nil {
		return err
	}
	sess.Member = memberID
	s.writeSession(w, sess)
	return nil
}

// ===== DB helpers =====

func (s *Service) memberForSubject(sub string) string {
	var id string
	if err := s.db.QueryRow(`SELECT id FROM family_member WHERE oidc_subject = ?`, sub).Scan(&id); err != nil {
		return ""
	}
	return id
}

func (s *Service) listMembers() ([]memberInfo, error) {
	rows, err := s.db.Query(`SELECT id, name, color, role, pin, oidc_subject FROM family_member ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []memberInfo{}
	for rows.Next() {
		var m memberInfo
		var pin, sub *string
		if err := rows.Scan(&m.ID, &m.Name, &m.Color, &m.Role, &pin, &sub); err != nil {
			return nil, err
		}
		m.HasPin = pin != nil && *pin != ""
		m.Mapped = sub != nil && *sub != ""
		out = append(out, m)
	}
	return out, rows.Err()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

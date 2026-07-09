// Package auth makes Tribo an OIDC relying party against Authentik and manages
// the signed session cookie + in-app profile switcher.
//
// When OIDC_ISSUER_URL is unset (or discovery fails) the service runs in
// "disabled" mode: no login is required and the session only tracks the active
// family-member profile. This keeps local/dev usable without an IdP.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const cookieName = "tribo_session"
const stateCookie = "tribo_oauth_state"

type Service struct {
	db       *sql.DB
	enabled  bool
	secret   []byte
	secure   bool
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier

	// Group-based member provisioning (see provision.go).
	groupsClaim    string   // ID-token claim holding the user's groups
	guardianGroups []string // group names mapped to role "guardian"
	childGroups    []string // group names mapped to role "child"
}

// session is the signed cookie payload.
type session struct {
	Sub    string `json:"sub"`    // Authentik subject (empty in disabled mode)
	Member string `json:"member"` // active family-member id
}

// New builds the auth service from the environment. It never hard-fails on
// OIDC discovery errors — it logs and falls back to disabled mode so the app
// still serves.
func New(db *sql.DB) *Service {
	s := &Service{db: db, secret: loadSecret()}

	issuer := os.Getenv("OIDC_ISSUER_URL")
	if issuer == "" {
		log.Printf("auth: OIDC not configured — auth disabled (dev mode)")
		return s
	}
	redirect := os.Getenv("OIDC_REDIRECT_URL")
	if redirect == "" {
		redirect = "http://localhost:8080/auth/callback"
	}
	provider, err := oidc.NewProvider(context.Background(), issuer)
	if err != nil {
		log.Printf("auth: OIDC discovery failed (%v) — auth disabled", err)
		return s
	}
	clientID := os.Getenv("OIDC_CLIENT_ID")
	scopes := []string{oidc.ScopeOpenID, "profile", "email"}
	// Some IdPs (e.g. Authentik) only emit the groups claim when an extra scope
	// is requested.
	if extra := os.Getenv("OIDC_GROUPS_SCOPE"); extra != "" {
		scopes = append(scopes, extra)
	}
	s.oauth = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
		Endpoint:     provider.Endpoint(),
		RedirectURL:  redirect,
		Scopes:       scopes,
	}
	s.groupsClaim = envOr("OIDC_GROUPS_CLAIM", "groups")
	s.guardianGroups = splitGroups(envOr("OIDC_GUARDIAN_GROUPS", "guardian"))
	s.childGroups = splitGroups(envOr("OIDC_CHILD_GROUPS", "children,child"))
	s.verifier = provider.Verifier(&oidc.Config{ClientID: clientID})
	s.enabled = true
	s.secure = strings.HasPrefix(redirect, "https")
	log.Printf("auth: OIDC enabled (issuer %s)", issuer)
	return s
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// splitGroups parses a comma-separated, case-insensitive group list.
func splitGroups(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		if t := strings.ToLower(strings.TrimSpace(p)); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func loadSecret() []byte {
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		return []byte(v)
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return []byte("tribo-dev-insecure-secret")
	}
	log.Printf("auth: SESSION_SECRET unset — using a random secret (sessions reset on restart)")
	return b
}

// ===== Cookie signing =====

func (s *Service) encode(sess session) string {
	b, _ := json.Marshal(sess)
	payload := base64.RawURLEncoding.EncodeToString(b)
	return payload + "." + s.mac(payload)
}

func (s *Service) decode(v string) (session, bool) {
	parts := strings.SplitN(v, ".", 2)
	if len(parts) != 2 || !hmac.Equal([]byte(parts[1]), []byte(s.mac(parts[0]))) {
		return session{}, false
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return session{}, false
	}
	var sess session
	if err := json.Unmarshal(b, &sess); err != nil {
		return session{}, false
	}
	return sess, true
}

func (s *Service) mac(payload string) string {
	m := hmac.New(sha256.New, s.secret)
	m.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// ActiveMemberID returns the active profile's family-member id from the
// session cookie ("" when no profile is active). Used by handlers that need
// per-profile behavior (e.g. the chat assistant's child guardrails).
func (s *Service) ActiveMemberID(r *http.Request) string {
	sess, _ := s.readSession(r)
	return sess.Member
}

func (s *Service) readSession(r *http.Request) (session, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return session{}, false
	}
	return s.decode(c.Value)
}

func (s *Service) writeSession(w http.ResponseWriter, sess session) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    s.encode(sess),
		Path:     "/",
		HttpOnly: true,
		Secure:   s.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 24 * 30,
	})
}

func (s *Service) clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
}

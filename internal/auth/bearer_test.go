package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// req builds a GET with an optional Authorization header.
func req(authz string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	if authz != "" {
		r.Header.Set("Authorization", authz)
	}
	return r
}

// pass reports whether a wrapped handler let the request through (200) vs 401.
func pass(h http.Handler, r *http.Request) bool {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec.Code == http.StatusOK
}

var ok200 = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

func TestRequireToken(t *testing.T) {
	// No token configured: fail-open, everything passes.
	open := (&Service{}).RequireToken(ok200)
	if !pass(open, req("")) || !pass(open, req("Bearer whatever")) {
		t.Error("no token configured should pass through (fail-open)")
	}

	// Token configured: only the exact bearer passes.
	s := &Service{apiToken: "s3cret"}
	guarded := s.RequireToken(ok200)
	cases := map[string]bool{
		"":              false,
		"Bearer s3cret": true,
		"Bearer wrong":  false,
		"s3cret":        false, // missing "Bearer " prefix
		"bearer s3cret": false, // scheme is case-sensitive here
	}
	for authz, want := range cases {
		if got := pass(guarded, req(authz)); got != want {
			t.Errorf("RequireToken(%q) = %v, want %v", authz, got, want)
		}
	}
}

func TestProtectAcceptsBearerWhenEnabled(t *testing.T) {
	s := &Service{enabled: true, secret: []byte("k"), apiToken: "s3cret"}
	h := s.Protect(ok200)

	// No creds → 401; valid session cookie → pass; valid bearer → pass.
	if pass(h, req("")) {
		t.Error("OIDC on, no creds: must be 401")
	}
	if !pass(h, req("Bearer s3cret")) {
		t.Error("OIDC on, valid bearer: must pass")
	}
	cookieReq := req("")
	cookieReq.AddCookie(&http.Cookie{Name: cookieName, Value: s.encode(session{Sub: "u1"})})
	if !pass(h, cookieReq) {
		t.Error("OIDC on, valid session cookie: must pass")
	}
	if pass(h, req("Bearer nope")) {
		t.Error("OIDC on, wrong bearer: must be 401")
	}
}

func TestProtectOpenWhenDisabledEvenWithToken(t *testing.T) {
	// Headless-only semantics: a configured token does NOT gate the browser
	// API when OIDC is off — everything stays open.
	s := &Service{enabled: false, secret: []byte("k"), apiToken: "s3cret"}
	h := s.Protect(ok200)
	if !pass(h, req("")) {
		t.Error("OIDC off: API must stay open regardless of token")
	}
}

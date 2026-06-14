package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionRoundTrip(t *testing.T) {
	s := &Service{secret: []byte("test-secret")}
	enc := s.encode(session{Sub: "abc", Member: "mem-1"})
	got, ok := s.decode(enc)
	if !ok || got.Sub != "abc" || got.Member != "mem-1" {
		t.Fatalf("round trip failed: %+v ok=%v", got, ok)
	}
	// Tampered payload must fail verification.
	if _, ok := s.decode(enc + "x"); ok {
		t.Fatal("tampered cookie verified")
	}
}

func TestProtectEnabled(t *testing.T) {
	s := &Service{enabled: true, secret: []byte("test-secret")}
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := s.Protect(next)

	// No session → 401.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/events", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 without session, got %d", rec.Code)
	}

	// Valid authenticated session → passes through.
	rec = httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/events", nil)
	r.AddCookie(&http.Cookie{Name: cookieName, Value: s.encode(session{Sub: "abc", Member: "mem-1"})})
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 with session, got %d", rec.Code)
	}
}

func TestProtectDisabledAllowsAll(t *testing.T) {
	s := &Service{enabled: false, secret: []byte("test-secret")}
	rec := httptest.NewRecorder()
	s.Protect(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })).
		ServeHTTP(rec, httptest.NewRequest("GET", "/api/events", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("disabled mode should allow, got %d", rec.Code)
	}
}

package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdoptMemberLinksSubjectAndRefreshesCookie(t *testing.T) {
	s := newTestService(t)
	s.enabled = true
	s.secret = []byte("test-secret")

	// A member created by onboarding, not yet linked to any subject.
	memberID, err := s.insertMember("", "Alberto", "guardian")
	if err != nil {
		t.Fatalf("insert member: %v", err)
	}
	// insertMember stamps oidc_subject; clear it to mimic an onboarding-created
	// member (created via the onboarding tx, which sets no subject).
	if _, err := s.db.Exec(`UPDATE family_member SET oidc_subject = NULL WHERE id = ?`, memberID); err != nil {
		t.Fatal(err)
	}

	rec := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/onboarding", nil)
	r.AddCookie(&http.Cookie{Name: cookieName, Value: s.encode(session{Sub: "sub-xyz"})})

	if err := s.AdoptMember(rec, r, memberID); err != nil {
		t.Fatalf("AdoptMember: %v", err)
	}

	// The member is now linked to the subject.
	var sub *string
	if err := s.db.QueryRow(`SELECT oidc_subject FROM family_member WHERE id = ?`, memberID).Scan(&sub); err != nil {
		t.Fatal(err)
	}
	if sub == nil || *sub != "sub-xyz" {
		t.Fatalf("oidc_subject = %v, want sub-xyz", sub)
	}

	// The refreshed cookie carries the member so the next /api/session has no
	// needsMapping.
	res := rec.Result()
	var refreshed *http.Cookie
	for _, c := range res.Cookies() {
		if c.Name == cookieName {
			refreshed = c
		}
	}
	if refreshed == nil {
		t.Fatal("no session cookie written")
	}
	got, ok := s.decode(refreshed.Value)
	if !ok || got.Sub != "sub-xyz" || got.Member != memberID {
		t.Fatalf("refreshed session = %+v ok=%v, want Sub=sub-xyz Member=%s", got, ok, memberID)
	}
}

func TestAdoptMemberNoopWhenDisabled(t *testing.T) {
	s := newTestService(t)
	s.enabled = false
	s.secret = []byte("test-secret")

	rec := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/onboarding", nil)
	if err := s.AdoptMember(rec, r, "some-id"); err != nil {
		t.Fatalf("AdoptMember disabled: %v", err)
	}
	if len(rec.Result().Cookies()) != 0 {
		t.Fatal("disabled mode should not write a session cookie")
	}
}

package auth

import (
	"path/filepath"
	"testing"

	"tribo/internal/store"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return &Service{
		db:             db,
		groupsClaim:    "groups",
		guardianGroups: []string{"guardian"},
		childGroups:    []string{"children", "child"},
	}
}

func TestRoleForGroups(t *testing.T) {
	s := newTestService(t)
	cases := []struct {
		groups []string
		want   string
	}{
		{[]string{"guardian"}, "guardian"},
		{[]string{"Children"}, "child"}, // case-insensitive
		{[]string{"child"}, "child"},
		{[]string{"guardian", "children"}, "guardian"}, // guardian wins
		{[]string{"staff"}, ""},                        // unmatched
		{nil, ""},
	}
	for _, c := range cases {
		if got := s.roleForGroups(c.groups); got != c.want {
			t.Errorf("roleForGroups(%v) = %q, want %q", c.groups, got, c.want)
		}
	}
}

func TestInsertMemberGuardianThenChild(t *testing.T) {
	s := newTestService(t)

	gid, err := s.insertMember("sub-guardian", "Alberto", "guardian")
	if err != nil || gid == "" {
		t.Fatalf("insert guardian: id=%q err=%v", gid, err)
	}

	cid, err := s.insertMember("sub-child", "Marie", "child")
	if err != nil || cid == "" {
		t.Fatalf("insert child: id=%q err=%v", cid, err)
	}

	// Child should inherit the first guardian as default.
	var role, color string
	var defGuardian *string
	if err := s.db.QueryRow(`SELECT role, color, default_guardian_id FROM family_member WHERE id = ?`, cid).
		Scan(&role, &color, &defGuardian); err != nil {
		t.Fatalf("query child: %v", err)
	}
	if role != "child" {
		t.Errorf("child role = %q", role)
	}
	if defGuardian == nil || *defGuardian != gid {
		t.Errorf("child default_guardian_id = %v, want %q", defGuardian, gid)
	}
	if color != markerCurated[1] {
		t.Errorf("child should get color slot 1 (%s), got %s", markerCurated[1], color)
	}

	// A single family row must exist (not one per member).
	var fams int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM family`).Scan(&fams); err != nil {
		t.Fatal(err)
	}
	if fams != 1 {
		t.Errorf("family count = %d, want 1", fams)
	}
}

func TestInsertMemberIdempotentBySubject(t *testing.T) {
	s := newTestService(t)
	first, err := s.insertMember("sub-1", "A", "guardian")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.insertMember("sub-1", "A-renamed", "guardian")
	if err != nil {
		t.Fatal(err)
	}
	if first != again {
		t.Errorf("second insert for same subject made a new member: %q vs %q", first, again)
	}
	var n int
	s.db.QueryRow(`SELECT COUNT(*) FROM family_member`).Scan(&n)
	if n != 1 {
		t.Errorf("member count = %d, want 1", n)
	}
}

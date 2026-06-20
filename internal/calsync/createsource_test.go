package calsync

import (
	"database/sql"
	"path/filepath"
	"testing"

	"tribo/internal/store"
)

// CreateSource must persist a user-added CalDAV calendar as an unmanaged
// per-person overlay (kind=external, managed=0) and store the member_id when one
// is supplied (Round 3 D1).
func TestCreateSourcePersonOverlay(t *testing.T) {
	t.Setenv("TRIBO_SEED", "false")
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	// A member to attach the overlay to (FK target).
	if _, err := db.Exec(`INSERT INTO family (id, name, timezone) VALUES ('fam', 'Fam', 'UTC')`); err != nil {
		t.Fatalf("family: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO family_member (id, family_id, name, color, role, sort_order) VALUES ('m1', 'fam', 'Ana', '#3E6259', 'guardian', 0)`); err != nil {
		t.Fatalf("member: %v", err)
	}

	e := NewEngine(db)
	id, err := e.CreateSource(NewSource{Type: "caldav", DisplayName: "Ana work", URL: "http://x/", MemberID: "m1", ReadOnly: true})
	if err != nil {
		t.Fatalf("CreateSource: %v", err)
	}

	var kind string
	var memberID sql.NullString
	var managed, readOnly int
	if err := db.QueryRow(
		`SELECT kind, member_id, managed, read_only FROM calendar_source WHERE id = ?`, id).
		Scan(&kind, &memberID, &managed, &readOnly); err != nil {
		t.Fatalf("query: %v", err)
	}
	if kind != "external" {
		t.Errorf("kind = %q, want external", kind)
	}
	if !memberID.Valid || memberID.String != "m1" {
		t.Errorf("member_id = %+v, want m1", memberID)
	}
	if managed != 0 {
		t.Errorf("managed = %d, want 0", managed)
	}
	if readOnly != 1 {
		t.Errorf("read_only = %d, want 1", readOnly)
	}

	// With no member, member_id stays NULL (still kind=external).
	id2, err := e.CreateSource(NewSource{Type: "caldav", DisplayName: "Shared", URL: "http://y/"})
	if err != nil {
		t.Fatalf("CreateSource (no member): %v", err)
	}
	var m2 sql.NullString
	if err := db.QueryRow(`SELECT member_id FROM calendar_source WHERE id = ?`, id2).Scan(&m2); err != nil {
		t.Fatalf("query2: %v", err)
	}
	if m2.Valid {
		t.Errorf("member_id = %+v, want NULL", m2)
	}
}

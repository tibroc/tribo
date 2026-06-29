package chores_test

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"tribo/internal/chores"
	"tribo/internal/store"
)

func openSvc(t *testing.T) (*chores.Service, *sql.DB) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "chores.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return chores.NewService(db), db
}

func strptr(s string) *string { return &s }

// A weekly chore pinned to Sunday produces exactly one single-day instance per
// week, always landing on a Sunday.
func TestGenerateWeekdaySunday(t *testing.T) {
	svc, _ := openSvc(t)
	if _, err := svc.CreateChore(chores.NewChore{
		Title:              "Trash",
		RecurrenceRule:     "weekly",
		RecurrenceInterval: 1,
		AssignmentMode:     "fixed",
		RecurrenceWeekdays: strptr("0000001"), // Sun
	}); err != nil {
		t.Fatal(err)
	}

	// Window: Mon 2026-01-05 .. 2026-01-25 → Sundays Jan 11, 18, 25.
	from, to := day(2026, 1, 5), day(2026, 1, 26)
	if _, err := svc.Generate(from, to); err != nil {
		t.Fatal(err)
	}
	got := mustList(t, svc, from, to)
	if len(got) != 3 {
		t.Fatalf("want 3 Sunday instances, got %d", len(got))
	}
	for _, inst := range got {
		ps, _ := time.Parse("2006-01-02", inst.PeriodStart)
		if ps.Weekday() != time.Sunday {
			t.Errorf("instance %s is a %s, want Sunday", inst.PeriodStart, ps.Weekday())
		}
		if inst.PeriodEnd != ps.AddDate(0, 0, 1).Format("2006-01-02") {
			t.Errorf("instance %s period_end %s is not a single day", inst.PeriodStart, inst.PeriodEnd)
		}
	}
}

// Mon/Wed/Fri produces three instances per week on the right days.
func TestGenerateWeekdayMonWedFri(t *testing.T) {
	svc, _ := openSvc(t)
	if _, err := svc.CreateChore(chores.NewChore{
		Title:              "Meds",
		RecurrenceRule:     "weekly",
		RecurrenceInterval: 1,
		AssignmentMode:     "fixed",
		RecurrenceWeekdays: strptr("1010100"), // Mon, Wed, Fri
	}); err != nil {
		t.Fatal(err)
	}

	from, to := day(2026, 1, 5), day(2026, 1, 26) // 3 weeks → 9
	if _, err := svc.Generate(from, to); err != nil {
		t.Fatal(err)
	}
	got := mustList(t, svc, from, to)
	if len(got) != 9 {
		t.Fatalf("want 9 instances, got %d", len(got))
	}
	allowed := map[time.Weekday]bool{time.Monday: true, time.Wednesday: true, time.Friday: true}
	for _, inst := range got {
		ps, _ := time.Parse("2006-01-02", inst.PeriodStart)
		if !allowed[ps.Weekday()] {
			t.Errorf("instance %s is a %s, want Mon/Wed/Fri", inst.PeriodStart, ps.Weekday())
		}
	}
}

// Editing a chore's schedule drops stale future pending instances and lets the
// new schedule regenerate; done/skipped history is preserved.
func TestUpdateChoreReschedulesFuturePending(t *testing.T) {
	svc, db := openSvc(t)
	c, err := svc.CreateChore(chores.NewChore{
		Title:              "Trash",
		RecurrenceRule:     "weekly",
		RecurrenceInterval: 1,
		AssignmentMode:     "fixed",
		RecurrenceWeekdays: strptr("0000001"), // Sun
	})
	if err != nil {
		t.Fatal(err)
	}

	// A far-future Monday window (>= today, so the reschedule DELETE applies).
	from, to := day(2099, 1, 5), day(2099, 1, 26)
	if _, err := svc.Generate(from, to); err != nil {
		t.Fatal(err)
	}
	if n := len(mustList(t, svc, from, to)); n != 3 {
		t.Fatalf("want 3 Sunday instances pre-edit, got %d", n)
	}

	// Re-point to Mon/Wed/Fri.
	if _, err := svc.UpdateChore(c.ID, chores.NewChore{
		Title:              "Trash",
		RecurrenceRule:     "weekly",
		RecurrenceInterval: 1,
		AssignmentMode:     "fixed",
		RecurrenceWeekdays: strptr("1010100"),
	}); err != nil {
		t.Fatal(err)
	}

	// Future pending Sunday instances are gone.
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM chore_instance WHERE chore_id=? AND status='pending'`, c.ID).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	// Regenerate the window under the new schedule.
	if _, err := svc.Generate(from, to); err != nil {
		t.Fatal(err)
	}
	got := mustList(t, svc, from, to)
	if len(got) != 9 {
		t.Fatalf("want 9 Mon/Wed/Fri instances post-edit, got %d", len(got))
	}
	for _, inst := range got {
		ps, _ := time.Parse("2006-01-02", inst.PeriodStart)
		if ps.Weekday() == time.Sunday {
			t.Errorf("stale Sunday instance %s survived the reschedule", inst.PeriodStart)
		}
	}
}

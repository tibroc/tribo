package chores_test

import (
	"path/filepath"
	"testing"
	"time"

	"tribo/internal/chores"
	"tribo/internal/store"
)

// External test package (avoids the store→chores import cycle) covering the
// DB-backed behavior: idempotent generation and scheduled-period filtering.
func TestGenerateAndScheduledFilter(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "chores.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	// A fortnightly chore (every 2 weeks).
	if _, err := db.Exec(
		`INSERT INTO chore (id, title, recurrence_rule, recurrence_interval, assignment_mode)
		 VALUES ('c-fort', 'Fortnight', 'weekly', 2, 'fixed')`); err != nil {
		t.Fatal(err)
	}
	svc := chores.NewService(db)

	loc := time.UTC
	from := time.Date(2026, time.June, 1, 0, 0, 0, 0, loc)
	to := time.Date(2026, time.July, 1, 0, 0, 0, 0, loc)

	n1, err := svc.Generate(from, to)
	if err != nil {
		t.Fatal(err)
	}
	if n1 == 0 {
		t.Fatal("expected instances to be generated")
	}
	// Second run over the same window must create nothing (idempotent).
	n2, err := svc.Generate(from, to)
	if err != nil {
		t.Fatal(err)
	}
	if n2 != 0 {
		t.Errorf("second Generate created %d, want 0 (not idempotent)", n2)
	}

	// Fortnight buckets land on Jun 8 and Jun 22 (anchored to the global grid).
	// A week that contains a bucket start shows the chore; one that doesn't must not.
	weekWith := mustList(t, svc, day(2026, 6, 8), day(2026, 6, 15))   // contains Jun 8
	if len(weekWith) != 1 {
		t.Errorf("week of Jun 8 should show the fortnightly chore, got %d", len(weekWith))
	}
	weekWithout := mustList(t, svc, day(2026, 6, 15), day(2026, 6, 22)) // no bucket start
	if len(weekWithout) != 0 {
		t.Errorf("week of Jun 15 should NOT show it (scheduled Jun 8/Jun 22), got %d", len(weekWithout))
	}
	// The month view contains it.
	month := mustList(t, svc, from, to)
	if len(month) < 2 {
		t.Errorf("month should show both fortnight occurrences, got %d", len(month))
	}
}

func day(y, m, d int) time.Time { return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC) }

func mustList(t *testing.T, svc *chores.Service, from, to time.Time) []chores.Instance {
	t.Helper()
	got, err := svc.ListInstances(from, to)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

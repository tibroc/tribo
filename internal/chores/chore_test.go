package chores

import (
	"testing"
	"time"
)

func d(y int, m time.Month, day int) time.Time {
	return time.Date(y, m, day, 12, 0, 0, 0, time.UTC) // noon, to dodge any DST edges
}

func TestPeriodOf(t *testing.T) {
	cases := []struct {
		name      string
		rule      string
		interval  int
		day       time.Time
		wantStart string
		wantEnd   string
	}{
		{"daily", "daily", 1, d(2026, time.June, 19), "2026-06-19", "2026-06-20"},
		{"weekly aligns to Monday", "weekly", 1, d(2026, time.June, 19), "2026-06-15", "2026-06-22"},
		{"monthly aligns to 1st", "monthly", 1, d(2026, time.June, 19), "2026-06-01", "2026-07-01"},
		// every 3 months → calendar quarters Jan/Apr/Jul/Oct
		{"quarterly Jun→Apr bucket", "monthly", 3, d(2026, time.June, 19), "2026-04-01", "2026-07-01"},
		{"quarterly Jul→Jul bucket", "monthly", 3, d(2026, time.July, 2), "2026-07-01", "2026-10-01"},
		// yearly = monthly×12 → Jan 1
		{"yearly", "monthly", 12, d(2026, time.June, 19), "2026-01-01", "2027-01-01"},
		// every 5 years = monthly×60 → Jan 1 of year divisible by 5
		{"every 5 years", "monthly", 60, d(2026, time.June, 19), "2025-01-01", "2030-01-01"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			start, end := periodOf(c.rule, c.interval, c.day)
			if got := start.Format(dateFmt); got != c.wantStart {
				t.Errorf("start = %s, want %s", got, c.wantStart)
			}
			if got := end.Format(dateFmt); got != c.wantEnd {
				t.Errorf("end = %s, want %s", got, c.wantEnd)
			}
		})
	}
}

func TestEveryTwoWeeksConsistentFortnights(t *testing.T) {
	// Two days in the same fortnight bucket must yield the same period; the next
	// fortnight must be exactly 14 days later.
	s1, e1 := periodOf("weekly", 2, d(2026, time.June, 15))
	s2, _ := periodOf("weekly", 2, d(2026, time.June, 20)) // 5 days later, same fortnight
	if !s1.Equal(s2) {
		t.Fatalf("same fortnight expected equal starts: %s vs %s", s1.Format(dateFmt), s2.Format(dateFmt))
	}
	if got := e1.Sub(s1).Hours(); got != 14*24 {
		t.Errorf("fortnight length = %vh, want %vh", got, 14*24)
	}
	s3, _ := periodOf("weekly", 2, e1) // first day of next fortnight
	if got := s3.Sub(s1).Hours(); got != 14*24 {
		t.Errorf("next fortnight start delta = %vh, want %vh", got, 14*24)
	}
}

func TestNextPeriod(t *testing.T) {
	start := d(2026, time.January, 1)
	if got := nextPeriod("monthly", 3, start).Format(dateFmt); got != "2026-04-01" {
		t.Errorf("quarterly next = %s, want 2026-04-01", got)
	}
	if got := nextPeriod("weekly", 2, d(2026, time.June, 15)).Format(dateFmt); got != "2026-06-29" {
		t.Errorf("fortnightly next = %s, want 2026-06-29", got)
	}
}

func TestPeriodIndexDeterministicRotation(t *testing.T) {
	// The bucket index must depend only on the period start, not on how Generate
	// walked there — so rotation assignment is stable across generation windows.
	startA, _ := periodOf("weekly", 1, d(2026, time.June, 19))
	idx1 := periodIndex("weekly", 1, startA)
	// Same period reached from a different query day must report the same index.
	startB, _ := periodOf("weekly", 1, d(2026, time.June, 16))
	idx2 := periodIndex("weekly", 1, startB)
	if idx1 != idx2 {
		t.Errorf("index not stable: %d vs %d", idx1, idx2)
	}
	// Consecutive weeks differ by exactly 1.
	next := nextPeriod("weekly", 1, startA)
	if periodIndex("weekly", 1, next) != idx1+1 {
		t.Errorf("consecutive week index should increment by 1")
	}
}

func TestNormalizeRecurrence(t *testing.T) {
	cases := []struct {
		rule         string
		interval     int
		wantRule     string
		wantInterval int
	}{
		{"weekly", 2, "weekly", 2},
		{"", 0, "weekly", 1}, // empty rule + zero interval → defaults
		{"bogus", -5, "weekly", 1},
		{"monthly", 999, "monthly", maxInterval}, // capped
	}
	for _, c := range cases {
		r, i := normalizeRecurrence(c.rule, c.interval)
		if r != c.wantRule || i != c.wantInterval {
			t.Errorf("normalize(%q,%d) = (%q,%d), want (%q,%d)", c.rule, c.interval, r, i, c.wantRule, c.wantInterval)
		}
	}
}

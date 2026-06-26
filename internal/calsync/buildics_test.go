package calsync

import (
	"strings"
	"testing"

	"github.com/emersion/go-ical"

	"tribo/internal/calendar"
)

func icsText(cal *ical.Calendar, prop string) string {
	ev := cal.Events()[0]
	if p := ev.Props.Get(prop); p != nil {
		return p.Value
	}
	return ""
}

// buildICS must emit the RRULE (Round 4 H) and the chore status as both an
// X-TRIBO-STATUS prop and a human-visible summary cue (Round 4 A2).
func TestBuildICSRecurrenceAndStatus(t *testing.T) {
	rec := buildICS(calendar.BackendEvent{
		Title: "School", StartAt: "2026-06-22T08:00:00Z", EndAt: "2026-06-22T15:00:00Z",
		RecurrenceRule: "FREQ=WEEKLY",
	}, "evt-1")
	if got := icsText(rec, ical.PropRecurrenceRule); got != "FREQ=WEEKLY" {
		t.Errorf("RRULE = %q, want FREQ=WEEKLY", got)
	}

	done := buildICS(calendar.BackendEvent{
		Title: "Set the table", StartAt: "2026-06-22T00:00:00Z", EndAt: "2026-06-23T00:00:00Z",
		AllDay: true, Status: "done",
	}, "chore-1")
	if got := icsText(done, propStatus); got != "done" {
		t.Errorf("X-TRIBO-STATUS = %q, want done", got)
	}
	if got := icsText(done, ical.PropSummary); !strings.HasPrefix(got, "✓ ") {
		t.Errorf("summary = %q, want ✓ prefix", got)
	}

	skip := buildICS(calendar.BackendEvent{Title: "Mow", StartAt: "2026-06-22T00:00:00Z", EndAt: "2026-06-23T00:00:00Z", AllDay: true, Status: "skipped"}, "chore-2")
	if got := icsText(skip, ical.PropSummary); !strings.HasPrefix(got, "✗ ") {
		t.Errorf("skipped summary = %q, want ✗ prefix", got)
	}

	// Pending / non-chore events keep a clean summary and no status prop.
	plain := buildICS(calendar.BackendEvent{Title: "Dentist", StartAt: "2026-06-22T09:00:00Z", EndAt: "2026-06-22T10:00:00Z"}, "evt-2")
	if got := icsText(plain, ical.PropSummary); got != "Dentist" {
		t.Errorf("plain summary = %q, want Dentist", got)
	}
	if got := icsText(plain, propStatus); got != "" {
		t.Errorf("plain status = %q, want empty", got)
	}
}

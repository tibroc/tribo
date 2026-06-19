package calsync

import (
	"testing"

	gcal "google.golang.org/api/calendar/v3"
)

func TestGoogleToEvent(t *testing.T) {
	// Timed event.
	pe, ok := googleToEvent(&gcal.Event{
		Id:      "abc",
		Summary: "Standup",
		Start:   &gcal.EventDateTime{DateTime: "2026-06-20T09:00:00+01:00"},
		End:     &gcal.EventDateTime{DateTime: "2026-06-20T09:30:00+01:00"},
	})
	if !ok || pe.uid != "abc" || pe.title != "Standup" || pe.allDay {
		t.Fatalf("timed event mapped wrong: %+v ok=%v", pe, ok)
	}

	// All-day event uses Date (not DateTime).
	pe, ok = googleToEvent(&gcal.Event{
		Id:    "def",
		Start: &gcal.EventDateTime{Date: "2026-06-21"},
		End:   &gcal.EventDateTime{Date: "2026-06-22"},
	})
	if !ok || !pe.allDay || pe.title != "(untitled)" {
		t.Fatalf("all-day event mapped wrong: %+v ok=%v", pe, ok)
	}

	// Missing start/end is rejected.
	if _, ok := googleToEvent(&gcal.Event{Id: "x"}); ok {
		t.Error("event without start/end should not map")
	}
}

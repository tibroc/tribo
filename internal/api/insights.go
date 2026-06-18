package api

import (
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

const sharedColor = "#D99A2B" // gold — family-wide / external

// membersByID returns members keyed by id plus the ordered slice.
func (s *Server) membersByID() (map[string]family.Member, []family.Member, error) {
	ms, err := s.family.ListMembers()
	if err != nil {
		return nil, nil, err
	}
	byID := make(map[string]family.Member, len(ms))
	for _, m := range ms {
		byID[m.ID] = m
	}
	return byID, ms, nil
}

// eventColor mirrors the frontend colorForEvent: override → first attendee → shared.
func eventColor(ev calendar.Event, byID map[string]family.Member) string {
	if ev.ColorOverride != nil {
		return *ev.ColorOverride
	}
	if !ev.IsShared && len(ev.AttendeeIDs) > 0 {
		if m, ok := byID[ev.AttendeeIDs[0]]; ok {
			return m.Color
		}
	}
	return sharedColor
}

// eventPerson returns the owning member's name, or "" for family-wide events
// (the frontend renders a localized "Family" label for the empty case).
func eventPerson(ev calendar.Event, byID map[string]family.Member) string {
	if !ev.IsShared && len(ev.AttendeeIDs) > 0 {
		if m, ok := byID[ev.AttendeeIDs[0]]; ok {
			return m.Name
		}
	}
	return ""
}

// weekdayIndex maps a time to Mon=0..Sun=6.
func weekdayIndex(t time.Time) int { return (int(t.Weekday()) + 6) % 7 }

func mondayOf(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	return d.AddDate(0, 0, -weekdayIndex(d))
}

func pct(done, total int) int {
	if total == 0 {
		return 100
	}
	return int(float64(done)/float64(total)*100 + 0.5)
}


package api

import (
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

const sharedColor = "#D99A2B" // gold — family-wide / external

var weekdayAbbr = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}

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

func eventPerson(ev calendar.Event, byID map[string]family.Member) string {
	if !ev.IsShared && len(ev.AttendeeIDs) > 0 {
		if m, ok := byID[ev.AttendeeIDs[0]]; ok {
			return m.Name
		}
	}
	return "Family"
}

// weekdayIndex maps a time to Mon=0..Sun=6.
func weekdayIndex(t time.Time) int { return (int(t.Weekday()) + 6) % 7 }

func mondayOf(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	return d.AddDate(0, 0, -weekdayIndex(d))
}

func formatClock(t time.Time) string { return t.Format("3:04 PM") }

func pct(done, total int) int {
	if total == 0 {
		return 100
	}
	return int(float64(done)/float64(total)*100 + 0.5)
}

// daysLabel summarizes the weekdays an event-series occurs on within a week:
// a contiguous run of ≥3 → "Mon – Fri"; a single timed day → "Mon, 9:00 AM";
// otherwise the comma list "Tue, Thu".
func daysLabel(idxs []int, singleTime string) string {
	if len(idxs) == 0 {
		return ""
	}
	if len(idxs) == 1 {
		if singleTime != "" {
			return weekdayAbbr[idxs[0]] + ", " + singleTime
		}
		return weekdayAbbr[idxs[0]]
	}
	contiguous := true
	for i := 1; i < len(idxs); i++ {
		if idxs[i] != idxs[i-1]+1 {
			contiguous = false
			break
		}
	}
	if contiguous && len(idxs) >= 3 {
		return weekdayAbbr[idxs[0]] + " – " + weekdayAbbr[idxs[len(idxs)-1]]
	}
	out := ""
	for i, idx := range idxs {
		if i > 0 {
			out += ", "
		}
		out += weekdayAbbr[idx]
	}
	return out
}

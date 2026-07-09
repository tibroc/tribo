package tools

import (
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

// sourceForAttendees picks the calendar a new event should live on: a single
// attendee → that person's calendar; otherwise the family calendar (mirroring
// the web EventForm). Falls back to any writable person calendar.
func (d *Deps) sourceForAttendees(attendeeIDs []string) string {
	srcs, err := d.events.ListSources()
	if err != nil {
		return ""
	}
	var familySrc, fallback string
	for _, s := range srcs {
		if s.ReadOnly {
			continue
		}
		switch s.Kind {
		case "person":
			if len(attendeeIDs) == 1 && s.MemberID != nil && *s.MemberID == attendeeIDs[0] {
				return s.ID
			}
			if fallback == "" {
				fallback = s.ID
			}
		case "family":
			familySrc = s.ID
		}
	}
	if familySrc != "" {
		return familySrc
	}
	return fallback
}

func (d *Deps) memberLites() map[string]family.Member {
	ms, _ := d.family.ListMembers()
	byID := make(map[string]family.Member, len(ms))
	for _, m := range ms {
		byID[m.ID] = m
	}
	return byID
}

func (d *Deps) personFor(ev calendar.Event, byID map[string]family.Member) string {
	if !ev.IsShared && len(ev.AttendeeIDs) > 0 {
		if m, ok := byID[ev.AttendeeIDs[0]]; ok {
			return m.Name
		}
	}
	return "Family"
}

func (d *Deps) eventsBetween(from, to time.Time) ([]EventDTO, error) {
	events, err := d.events.ListEvents(from, to)
	if err != nil {
		return nil, err
	}
	byID := d.memberLites()
	out := []EventDTO{}
	for _, ev := range events {
		out = append(out, EventDTO{Title: ev.Title, Start: ev.StartAt, End: ev.EndAt, Person: d.personFor(ev, byID)})
	}
	return out, nil
}

// availability reports which members are free in [from, to): busy if they are an
// attendee of an overlapping event, or (guardians) have an overlapping work block.
func (d *Deps) availability(fromStr, toStr string) (AvailabilityOut, error) {
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		return AvailabilityOut{}, err
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		return AvailabilityOut{}, err
	}

	members, err := d.family.ListMembers()
	if err != nil {
		return AvailabilityOut{}, err
	}
	events, err := d.events.ListEvents(from, to)
	if err != nil {
		return AvailabilityOut{}, err
	}
	schedules, _ := d.family.ListWorkSchedules()

	// Members busy from an overlapping event they attend.
	busyEvent := map[string]bool{}
	for _, ev := range events {
		for _, a := range ev.AttendeeIDs {
			busyEvent[a] = true
		}
	}

	weekday := (int(from.Weekday()) + 6) % 7
	fromMin := from.Hour()*60 + from.Minute()
	toMin := to.Hour()*60 + to.Minute()

	out := AvailabilityOut{Members: []MemberAvail{}}
	for _, m := range members {
		ma := MemberAvail{MemberID: m.ID, Name: m.Name, Free: true}
		if busyEvent[m.ID] {
			ma.Free, ma.Reason = false, "has an event"
		} else {
			for _, ws := range schedules {
				if ws.MemberID != m.ID || weekday >= len(ws.DaysOfWeek) || ws.DaysOfWeek[weekday] != '1' {
					continue
				}
				if minutesOverlap(fromMin, toMin, clockMinutes(ws.StartTime), clockMinutes(ws.EndTime)) {
					ma.Free, ma.Reason = false, ws.Label
					break
				}
			}
		}
		out.Members = append(out.Members, ma)
	}
	return out, nil
}

func clockMinutes(hhmm string) int {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 0
	}
	return t.Hour()*60 + t.Minute()
}

func minutesOverlap(aStart, aEnd, bStart, bEnd int) bool {
	return aStart < bEnd && aEnd > bStart
}

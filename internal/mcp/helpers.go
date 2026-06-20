package mcp

import (
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

// sourceForAttendees picks the calendar a new event should live on: a single
// attendee → that person's calendar; otherwise the family calendar (mirroring
// the web EventForm). Falls back to any writable person calendar.
func (d *deps) sourceForAttendees(attendeeIDs []string) string {
	srcs, err := d.events.ListSources()
	if err != nil {
		return ""
	}
	var family, fallback string
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
			family = s.ID
		}
	}
	if family != "" {
		return family
	}
	return fallback
}

func (d *deps) memberLites() map[string]family.Member {
	ms, _ := d.family.ListMembers()
	byID := make(map[string]family.Member, len(ms))
	for _, m := range ms {
		byID[m.ID] = m
	}
	return byID
}

func (d *deps) personFor(ev calendar.Event, byID map[string]family.Member) string {
	if !ev.IsShared && len(ev.AttendeeIDs) > 0 {
		if m, ok := byID[ev.AttendeeIDs[0]]; ok {
			return m.Name
		}
	}
	return "Family"
}

func (d *deps) eventsBetween(from, to time.Time) ([]eventDTO, error) {
	events, err := d.events.ListEvents(from, to)
	if err != nil {
		return nil, err
	}
	byID := d.memberLites()
	out := []eventDTO{}
	for _, ev := range events {
		out = append(out, eventDTO{Title: ev.Title, Start: ev.StartAt, End: ev.EndAt, Person: d.personFor(ev, byID)})
	}
	return out, nil
}

func (d *deps) briefing() briefingOut {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.AddDate(0, 0, 1)

	evs, _ := d.eventsBetween(start, end)
	out := briefingOut{Date: start.Format("2006-01-02"), Events: evs, PendingChores: []string{}, OpenTodos: []string{}}

	instances, _ := d.chores.ListInstances(start, end)
	for _, ci := range instances {
		if ci.Status == "pending" {
			out.PendingChores = append(out.PendingChores, ci.Title)
		}
	}
	allTodos, _ := d.todos.List()
	for _, t := range allTodos {
		if t.Status == "open" {
			out.OpenTodos = append(out.OpenTodos, t.Title)
		}
	}
	return out
}

// availability reports which members are free in [from, to): busy if they are an
// attendee of an overlapping event, or (guardians) have an overlapping work block.
func (d *deps) availability(fromStr, toStr string) (availabilityOut, error) {
	from, err := time.Parse(time.RFC3339, fromStr)
	if err != nil {
		return availabilityOut{}, err
	}
	to, err := time.Parse(time.RFC3339, toStr)
	if err != nil {
		return availabilityOut{}, err
	}

	members, err := d.family.ListMembers()
	if err != nil {
		return availabilityOut{}, err
	}
	events, err := d.events.ListEvents(from, to)
	if err != nil {
		return availabilityOut{}, err
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

	out := availabilityOut{Members: []memberAvail{}}
	for _, m := range members {
		ma := memberAvail{MemberID: m.ID, Name: m.Name, Free: true}
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

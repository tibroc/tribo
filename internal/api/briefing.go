package api

import (
	"net/http"
	"sort"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
)

type agendaItem struct {
	Time   string `json:"time"`
	Title  string `json:"title"`
	Color  string `json:"color"`
	Person string `json:"person"`
}

type weekHighlight struct {
	Label   string `json:"label"`
	Days    string `json:"days"`
	Special bool   `json:"special"`
}

type personWeek struct {
	MemberID   string          `json:"memberId"`
	Name       string          `json:"name"`
	Color      string          `json:"color"`
	Highlights []weekHighlight `json:"highlights"`
	Chores     []string        `json:"chores"`
}

type familyHighlight struct {
	Title string `json:"title"`
	Day   string `json:"day"`
	Color string `json:"color"`
	Icon  string `json:"icon,omitempty"`
}

type briefing struct {
	RangeLabel       string            `json:"rangeLabel"`
	Countdown        *countdown        `json:"countdown,omitempty"`
	Today            []agendaItem      `json:"today"`
	PersonWeeks      []personWeek      `json:"personWeeks"`
	FamilyHighlights []familyHighlight `json:"familyHighlights"`
	LastWeek         tally             `json:"lastWeek"`
}

type countdown struct {
	Days  int    `json:"days"`
	Title string `json:"title"`
}

type tally struct {
	ChoresDone  int `json:"choresDone"`
	ChoresTotal int `json:"choresTotal"`
	TodosDone   int `json:"todosDone"`
	TodosTotal  int `json:"todosTotal"`
}

func (s *Server) getBriefing(w http.ResponseWriter, _ *http.Request) {
	byID, members, err := s.membersByID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekStart := mondayOf(today)
	weekEnd := weekStart.AddDate(0, 0, 7)

	weekEvents, err := s.events.ListEvents(weekStart, weekEnd)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	out := briefing{
		RangeLabel:       formatRange(weekStart, weekStart.AddDate(0, 0, 6)),
		Today:            []agendaItem{},
		PersonWeeks:      []personWeek{},
		FamilyHighlights: []familyHighlight{},
	}

	// Today's agenda.
	for _, ev := range weekEvents {
		start, _ := time.Parse(time.RFC3339, ev.StartAt)
		if !sameYMD(start, today) || ev.AllDay {
			continue
		}
		out.Today = append(out.Today, agendaItem{
			Time: formatClock(start), Title: ev.Title,
			Color: eventColor(ev, byID), Person: eventPerson(ev, byID),
		})
	}

	// Per-person week: grouped event highlights + this week's chores.
	weekChores, _ := s.chores.ListInstances(weekStart, weekEnd)
	for _, m := range members {
		pw := personWeek{MemberID: m.ID, Name: m.Name, Color: m.Color, Highlights: []weekHighlight{}, Chores: []string{}}
		pw.Highlights = highlightsFor(m.ID, weekEvents)
		for _, ci := range weekChores {
			if ci.AssignedMemberID != nil && *ci.AssignedMemberID == m.ID {
				pw.Chores = append(pw.Chores, ci.Title)
			}
		}
		out.PersonWeeks = append(out.PersonWeeks, pw)
	}

	// Family highlights: shared or milestone events this week.
	for _, ev := range weekEvents {
		if !(ev.IsShared || ev.VisibilityTag == "milestone") {
			continue
		}
		start, _ := time.Parse(time.RFC3339, ev.StartAt)
		icon := ""
		if ev.Icon != nil {
			icon = *ev.Icon
		}
		out.FamilyHighlights = append(out.FamilyHighlights, familyHighlight{
			Title: ev.Title, Day: start.Weekday().String(), Color: eventColor(ev, byID), Icon: icon,
		})
	}

	// Countdown to the next milestone after today (look a year ahead).
	upcoming, _ := s.events.ListEvents(today, today.AddDate(1, 0, 0))
	for _, ev := range upcoming {
		if ev.VisibilityTag != "milestone" {
			continue
		}
		start, _ := time.Parse(time.RFC3339, ev.StartAt)
		days := int(time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location()).Sub(today).Hours() / 24)
		if days < 0 {
			continue
		}
		out.Countdown = &countdown{Days: days, Title: ev.Title}
		break
	}

	// Last week's tally.
	out.LastWeek = s.tallyFor(weekStart.AddDate(0, 0, -7), weekStart, byID)

	writeJSON(w, http.StatusOK, out)
}

// highlightsFor groups a member's events this week by title into day-summarized rows.
func highlightsFor(memberID string, events []calendar.Event) []weekHighlight {
	type group struct {
		idxs    []int
		time    string
		special bool
		order   int
	}
	groups := map[string]*group{}
	order := 0
	for _, ev := range events {
		isAttendee := false
		for _, a := range ev.AttendeeIDs {
			if a == memberID {
				isAttendee = true
				break
			}
		}
		if !isAttendee {
			continue
		}
		start, _ := time.Parse(time.RFC3339, ev.StartAt)
		g, ok := groups[ev.Title]
		if !ok {
			g = &group{order: order}
			groups[ev.Title] = g
			order++
		}
		g.idxs = append(g.idxs, weekdayIndex(start))
		if !ev.AllDay {
			g.time = formatClock(start)
		}
		if ev.VisibilityTag == "milestone" {
			g.special = true
		}
	}

	out := make([]weekHighlight, 0, len(groups))
	titles := make([]string, 0, len(groups))
	for t := range groups {
		titles = append(titles, t)
	}
	sort.Slice(titles, func(i, j int) bool { return groups[titles[i]].order < groups[titles[j]].order })
	for _, t := range titles {
		g := groups[t]
		sort.Ints(g.idxs)
		single := ""
		if len(g.idxs) == 1 {
			single = g.time
		}
		out = append(out, weekHighlight{Label: t, Days: daysLabel(g.idxs, single), Special: g.special})
	}
	return out
}

// tallyFor counts chores + todos completed in [from, to).
func (s *Server) tallyFor(from, to time.Time, _ map[string]family.Member) tally {
	var t tally
	instances, _ := s.chores.ListInstances(from, to)
	for _, ci := range instances {
		ps, _ := time.Parse("2006-01-02", ci.PeriodStart)
		if ps.Before(from) || !ps.Before(to) {
			continue
		}
		t.ChoresTotal++
		if ci.Status == "done" {
			t.ChoresDone++
		}
	}
	allTodos, _ := s.todos.List()
	for _, td := range allTodos {
		if td.Status == "done" && td.CompletedAt != nil {
			done, err := time.Parse(time.RFC3339, *td.CompletedAt)
			if err == nil && !done.Before(from) && done.Before(to) {
				t.TodosDone++
				t.TodosTotal++
			}
		}
	}
	return t
}

func sameYMD(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

var monthsShort = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}

func formatRange(a, b time.Time) string {
	if a.Month() == b.Month() {
		return monthsShort[int(a.Month())-1] + " " + itoa(a.Day()) + " – " + itoa(b.Day())
	}
	return monthsShort[int(a.Month())-1] + " " + itoa(a.Day()) + " – " + monthsShort[int(b.Month())-1] + " " + itoa(b.Day())
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

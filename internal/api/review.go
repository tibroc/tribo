package api

import (
	"net/http"
	"time"

	"tribo/internal/chores"
)

type stat struct {
	Done  int `json:"done"`
	Total int `json:"total"`
	Pct   int `json:"pct"`
}

type personReview struct {
	MemberID    string `json:"memberId"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	ChoresDone  int    `json:"choresDone"`
	ChoresTotal int    `json:"choresTotal"`
	TodosDone   int    `json:"todosDone"`
	TodosTotal  int    `json:"todosTotal"`
	Streak      int    `json:"streak"`
}

type choreConsistency struct {
	ChoreID  string `json:"choreId"`
	Title    string `json:"title"`
	Color    string `json:"color"`
	Who      string `json:"who"`      // member name; "" when Rotation
	Rotation bool   `json:"rotation"` // frontend shows a localized "Rotation" label
	History  []bool `json:"history"`  // last 8 weeks, index 7 = current week
}

type review struct {
	Period      string             `json:"period"`
	RangeStart  string             `json:"rangeStart"` // RFC3339
	RangeEnd    string             `json:"rangeEnd"`   // RFC3339 (today)
	Chores      stat               `json:"chores"`
	Todos       stat               `json:"todos"`
	Events      int                `json:"events"`
	PerPerson   []personReview     `json:"perPerson"`
	Consistency []choreConsistency `json:"consistency"`
	YTD         ytd                `json:"ytd"`
}

type ytd struct {
	Chores    int `json:"chores"`
	Todos     int `json:"todos"`
	Birthdays int `json:"birthdays"`
}

func (s *Server) getReview(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "week"
	}
	_, members, err := s.membersByID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	rangeEnd := today.AddDate(0, 0, 1)
	var rangeStart time.Time
	switch period {
	case "month":
		rangeStart = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	case "year":
		rangeStart = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	default:
		period = "week"
		rangeStart = mondayOf(today)
	}

	out := review{Period: period, RangeStart: rangeStart.Format(time.RFC3339), RangeEnd: today.Format(time.RFC3339), PerPerson: []personReview{}, Consistency: []choreConsistency{}}

	// Hero: chores in range.
	rangeInstances, _ := s.chores.ListInstances(rangeStart, rangeEnd)
	inRange := func(ci chores.Instance) bool {
		ps, _ := time.Parse("2006-01-02", ci.PeriodStart)
		return !ps.Before(rangeStart) && ps.Before(rangeEnd)
	}
	for _, ci := range rangeInstances {
		if !inRange(ci) {
			continue
		}
		out.Chores.Total++
		if ci.Status == "done" {
			out.Chores.Done++
		}
	}
	out.Chores.Pct = pct(out.Chores.Done, out.Chores.Total)

	// Hero: todos (done in range; total = done-in-range + currently open).
	allTodos, _ := s.todos.List()
	openCount := 0
	for _, td := range allTodos {
		if td.Status == "done" && td.CompletedAt != nil {
			d, err := time.Parse(time.RFC3339, *td.CompletedAt)
			if err == nil && !d.Before(rangeStart) && d.Before(rangeEnd) {
				out.Todos.Done++
			}
		} else if td.Status == "open" {
			openCount++
		}
	}
	out.Todos.Total = out.Todos.Done + openCount
	out.Todos.Pct = pct(out.Todos.Done, out.Todos.Total)

	// Hero: events in range.
	evs, _ := s.events.ListEvents(rangeStart, rangeEnd)
	out.Events = len(evs)

	// Per-person chores/todos in range + streak.
	weekStreaks := s.computeStreaks(today)
	for _, m := range members {
		pr := personReview{MemberID: m.ID, Name: m.Name, Color: m.Color, Streak: weekStreaks[m.ID]}
		for _, ci := range rangeInstances {
			if !inRange(ci) || ci.AssignedMemberID == nil || *ci.AssignedMemberID != m.ID {
				continue
			}
			pr.ChoresTotal++
			if ci.Status == "done" {
				pr.ChoresDone++
			}
		}
		for _, td := range allTodos {
			if td.AssignedMemberID == nil || *td.AssignedMemberID != m.ID {
				continue
			}
			if td.Status == "done" && td.CompletedAt != nil {
				d, err := time.Parse(time.RFC3339, *td.CompletedAt)
				if err == nil && !d.Before(rangeStart) && d.Before(rangeEnd) {
					pr.TodosDone++
					pr.TodosTotal++
				}
			} else if td.Status == "open" {
				pr.TodosTotal++
			}
		}
		out.PerPerson = append(out.PerPerson, pr)
	}

	// Chore consistency: fixed last 8 weeks.
	out.Consistency = s.choreConsistency(today)

	// Year to date.
	yearStart := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	ytdInstances, _ := s.chores.ListInstances(yearStart, rangeEnd)
	for _, ci := range ytdInstances {
		ps, _ := time.Parse("2006-01-02", ci.PeriodStart)
		if !ps.Before(yearStart) && ps.Before(rangeEnd) && ci.Status == "done" {
			out.YTD.Chores++
		}
	}
	for _, td := range allTodos {
		if td.Status == "done" && td.CompletedAt != nil {
			d, err := time.Parse(time.RFC3339, *td.CompletedAt)
			if err == nil && d.Year() == now.Year() {
				out.YTD.Todos++
			}
		}
	}
	yearEvents, _ := s.events.ListEvents(yearStart, rangeEnd)
	for _, ev := range yearEvents {
		if ev.Icon != nil && *ev.Icon == "cake" {
			out.YTD.Birthdays++
		}
	}

	writeJSON(w, http.StatusOK, out)
}

// choreConsistency builds the 8-week done/not-done grid (index 7 = current week).
func (s *Server) choreConsistency(today time.Time) []choreConsistency {
	out := []choreConsistency{}
	cs, _ := s.chores.ListChores()
	members, _, _ := s.membersByID()

	currentWeek := mondayOf(today)
	windowStart := currentWeek.AddDate(0, 0, -7*7) // 8 weeks back incl. current
	instances, _ := s.chores.ListInstances(windowStart, currentWeek.AddDate(0, 0, 7))

	// Index done instances per chore per week bucket.
	doneByChoreWeek := map[string]map[int]bool{}
	for _, ci := range instances {
		if ci.Status != "done" {
			continue
		}
		ps, _ := time.Parse("2006-01-02", ci.PeriodStart)
		wk := 7 - int(currentWeek.Sub(mondayOf(ps)).Hours()/(24*7)+0.5)
		if wk < 0 || wk > 7 {
			continue
		}
		if doneByChoreWeek[ci.ChoreID] == nil {
			doneByChoreWeek[ci.ChoreID] = map[int]bool{}
		}
		doneByChoreWeek[ci.ChoreID][wk] = true
	}

	for _, c := range cs {
		who := ""
		rotation := true
		if c.AssignmentMode == "fixed" && c.AssignedMemberID != nil {
			rotation = false
			if m, ok := members[*c.AssignedMemberID]; ok {
				who = m.Name
			}
		}
		color := sharedColor
		if c.Color != nil {
			color = *c.Color
		}
		hist := make([]bool, 8)
		for w := 0; w < 8; w++ {
			hist[w] = doneByChoreWeek[c.ID][w]
		}
		out = append(out, choreConsistency{ChoreID: c.ID, Title: c.Title, Color: color, Who: who, Rotation: rotation, History: hist})
	}
	return out
}

// computeStreaks returns, per member, the run of consecutive recent fully-completed
// weeks ending at last week (weeks with ≥1 assigned instance, all done).
func (s *Server) computeStreaks(today time.Time) map[string]int {
	streaks := map[string]int{}
	currentWeek := mondayOf(today)
	windowStart := currentWeek.AddDate(0, 0, -7*16)
	instances, _ := s.chores.ListInstances(windowStart, currentWeek)

	// member -> weekMonday(date string) -> [total, done]. Key by calendar date,
	// not Unix: period_start parses as UTC while `today` is local, so instant
	// equality would never match across timezones.
	type td struct{ total, done int }
	byMemberWeek := map[string]map[string]*td{}
	for _, ci := range instances {
		if ci.AssignedMemberID == nil {
			continue
		}
		ps, _ := time.Parse("2006-01-02", ci.PeriodStart)
		wk := mondayOf(ps).Format("2006-01-02")
		mm := byMemberWeek[*ci.AssignedMemberID]
		if mm == nil {
			mm = map[string]*td{}
			byMemberWeek[*ci.AssignedMemberID] = mm
		}
		if mm[wk] == nil {
			mm[wk] = &td{}
		}
		mm[wk].total++
		if ci.Status == "done" {
			mm[wk].done++
		}
	}

	for member, weeks := range byMemberWeek {
		streak := 0
		// Walk back from last week (week before current).
		for wk := currentWeek.AddDate(0, 0, -7); ; wk = wk.AddDate(0, 0, -7) {
			rec, ok := weeks[wk.Format("2006-01-02")]
			if !ok || rec.total == 0 || rec.done < rec.total {
				break
			}
			streak++
		}
		streaks[member] = streak
	}
	return streaks
}

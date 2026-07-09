package assistant

import (
	"encoding/json"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/chores"
	"tribo/internal/family"
	"tribo/internal/todos"
)

// briefContext is the grounding payload sent to the model. Everything in it
// comes from the service layer — the model summarizes and prioritizes real
// data, it never invents items. Only first names, titles, and times are
// included; never PINs, OIDC subjects, or credentials.
type briefContext struct {
	Kind        string      `json:"kind"` // day | week
	Today       string      `json:"today"`
	PeriodStart string      `json:"periodStart"`
	PeriodEnd   string      `json:"periodEnd"`
	Members     []ctxMember `json:"members"`
	Events      []ctxEvent  `json:"events"`
	Chores      []ctxChore  `json:"chores"`
	OpenTodos   []ctxTodo   `json:"openTodos"`
	WorkHours   []ctxWork   `json:"workHours"`
	LastWeek    ctxStats    `json:"lastWeek"`
}

type ctxMember struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Role string `json:"role"`
}

type ctxEvent struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Start         string   `json:"start"`
	End           string   `json:"end"`
	AllDay        bool     `json:"allDay,omitempty"`
	AttendeeIDs   []string `json:"attendeeIds,omitempty"`
	NeedsGuardian bool     `json:"needsGuardian,omitempty"`
}

type ctxChore struct {
	InstanceID string `json:"instanceId"`
	Title      string `json:"title"`
	Due        string `json:"due"` // period end, YYYY-MM-DD
	MemberID   string `json:"memberId,omitempty"`
	Status     string `json:"status"`
}

type ctxTodo struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	MemberID string `json:"memberId,omitempty"`
}

type ctxWork struct {
	MemberID string `json:"memberId"`
	Days     string `json:"days"` // 7 chars Mon..Sun
	Start    string `json:"start"`
	End      string `json:"end"`
}

type ctxStats struct {
	ChoresDone  int `json:"choresDone"`
	ChoresTotal int `json:"choresTotal"`
}

// buildContext assembles the payload for a day or week brief anchored at now
// (family wall clock).
func (s *Service) buildContext(kind string, now time.Time) (*briefContext, error) {
	famSvc := family.NewService(s.db)
	choreSvc := chores.NewService(s.db)
	todoSvc := todos.NewService(s.db)
	calSvc := calendar.NewService(s.db, nil) // read-only: ListEvents never touches the backend

	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	from, to := dayStart, dayStart.AddDate(0, 0, 1)
	if kind == "week" {
		from = dayStart.AddDate(0, 0, -((int(dayStart.Weekday()) + 6) % 7))
		to = from.AddDate(0, 0, 7)
	}

	ctx := &briefContext{
		Kind:        kind,
		Today:       now.Format("Monday, 2006-01-02"),
		PeriodStart: from.Format("2006-01-02"),
		PeriodEnd:   to.AddDate(0, 0, -1).Format("2006-01-02"),
	}

	members, err := famSvc.ListMembers()
	if err != nil {
		return nil, err
	}
	for _, m := range members {
		ctx.Members = append(ctx.Members, ctxMember{ID: m.ID, Name: m.Name, Role: m.Role})
	}

	events, err := calSvc.ListEvents(from, to)
	if err != nil {
		return nil, err
	}
	for _, e := range events {
		ctx.Events = append(ctx.Events, ctxEvent{
			ID: e.ID, Title: e.Title, Start: e.StartAt, End: e.EndAt, AllDay: e.AllDay,
			AttendeeIDs:   e.AttendeeIDs,
			NeedsGuardian: e.ConflictStatus == "needs_guardian",
		})
	}

	instances, err := choreSvc.ListInstances(from, to)
	if err != nil {
		return nil, err
	}
	for _, i := range instances {
		c := ctxChore{InstanceID: i.ID, Title: i.Title, Due: i.PeriodEnd, Status: i.Status}
		if i.AssignedMemberID != nil {
			c.MemberID = *i.AssignedMemberID
		}
		ctx.Chores = append(ctx.Chores, c)
	}

	allTodos, err := todoSvc.List()
	if err != nil {
		return nil, err
	}
	for _, t := range allTodos {
		if t.Status != "open" {
			continue
		}
		td := ctxTodo{ID: t.ID, Title: t.Title}
		if t.AssignedMemberID != nil {
			td.MemberID = *t.AssignedMemberID
		}
		ctx.OpenTodos = append(ctx.OpenTodos, td)
	}

	schedules, err := famSvc.ListWorkSchedules()
	if err != nil {
		return nil, err
	}
	for _, w := range schedules {
		ctx.WorkHours = append(ctx.WorkHours, ctxWork{MemberID: w.MemberID, Days: w.DaysOfWeek, Start: w.StartTime, End: w.EndTime})
	}

	// Last week's completion ratio grounds the "praise" line in real numbers.
	lwFrom := from.AddDate(0, 0, -7)
	lastWeek, err := choreSvc.ListInstances(lwFrom, from)
	if err == nil {
		for _, i := range lastWeek {
			if i.Status == "skipped" {
				continue
			}
			ctx.LastWeek.ChoresTotal++
			if i.Status == "done" {
				ctx.LastWeek.ChoresDone++
			}
		}
	}

	return ctx, nil
}

func (c *briefContext) json() string {
	b, _ := json.Marshal(c)
	return string(b)
}

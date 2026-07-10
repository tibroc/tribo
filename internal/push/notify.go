package push

import (
	"context"
	"fmt"
	"log"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/family"
	"tribo/internal/focus"
)

// The send scheduler: a 1-minute tick computes what each subscribed member is
// due — the morning brief at their hour, and transition warnings anchored to
// leaving times (event start − focus.LeaveBuffer), 15 minutes ahead (plus an
// optional 5-minute second nudge for pickups they're the guardian for).
// Quiet hours suppress everything; the push_sent log dedupes across restarts.
// Wording is part of the design: what's next and when to move — never
// "you're late" — and what comes after, for predictability.

const (
	warnLead  = 15 * time.Minute
	nudgeLead = 5 * time.Minute
	// fireWindow tolerates missed ticks (sleep, restart): a target fires if
	// "now" is within this window after it, at most once thanks to the log.
	fireWindow = 3 * time.Minute
)

// Run starts the scheduler; it returns immediately (the loop is a goroutine).
func (s *Service) Run(ctx context.Context) {
	if !s.Enabled() {
		return
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.tick(time.Now().In(s.familyLocation()))
			}
		}
	}()
}

// tick delivers everything due at "now". Exported logic kept in one testable
// function.
func (s *Service) tick(now time.Time) {
	members, err := s.membersWithSubscriptions()
	if err != nil || len(members) == 0 {
		return
	}
	s.pruneSent(now)

	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	events, err := calendar.NewService(s.db, nil).ListEvents(dayStart, dayStart.AddDate(0, 0, 1))
	if err != nil {
		log.Printf("push: list events: %v", err)
		events = nil
	}
	names := s.memberNames()

	for _, memberID := range members {
		prefs := s.GetPrefs(memberID)
		if inQuietHours(now, prefs.QuietStart, prefs.QuietEnd) {
			continue
		}
		if prefs.MorningBrief && now.Hour() == prefs.BriefHour && now.Minute() < 5 {
			s.sendMorningBrief(memberID, prefs, now)
		}
		if prefs.Transitions {
			s.sendTransitions(memberID, prefs, events, names, now)
		}
	}
}

// sendMorningBrief pushes one calm summary built from the focus queue. An
// empty queue sends nothing — silence is the notification.
func (s *Service) sendMorningBrief(memberID string, prefs Prefs, now time.Time) {
	key := fmt.Sprintf("brief:%s:%s", now.Format("2006-01-02"), memberID)
	if !s.markSent(key, now) {
		return
	}
	q, err := focus.NewService(s.db).BuildQueue(memberID, false, "")
	if err != nil || q.Now == nil {
		return
	}
	rest := len(q.Next) + q.LaterCount
	tr := texts(prefs.Lang)
	body := fmt.Sprintf(tr.briefFirst, q.Now.Title)
	if rest > 0 {
		body += " " + fmt.Sprintf(tr.briefMore, rest)
	}
	if q.Anchor != nil {
		if leave, err := time.Parse(time.RFC3339, q.Anchor.LeaveAt); err == nil {
			body += " " + fmt.Sprintf(tr.briefAnchor, q.Anchor.Title, clock(leave.In(now.Location()), prefs.Lang))
		}
	}
	s.deliver(memberID, payload{Title: tr.briefTitle, Body: body, Tag: key})
}

// sendTransitions warns before each leaving time of the member's timed events
// today (attendee or assigned guardian).
func (s *Service) sendTransitions(memberID string, prefs Prefs, events []calendar.Event, names map[string]string, now time.Time) {
	mine := involvedEvents(events, memberID)
	for i, ev := range mine {
		start, err := time.Parse(time.RFC3339, ev.StartAt)
		if err != nil {
			continue
		}
		start = start.In(now.Location())
		leave := start.Add(-focus.LeaveBuffer)

		targets := []struct {
			lead time.Duration
			tag  string
		}{{warnLead, "15"}}
		if prefs.SecondNudge && ev.AssignedGuardianID != nil && *ev.AssignedGuardianID == memberID {
			targets = append(targets, struct {
				lead time.Duration
				tag  string
			}{nudgeLead, "5"})
		}

		for _, tg := range targets {
			target := leave.Add(-tg.lead)
			if now.Before(target) || now.Sub(target) >= fireWindow {
				continue
			}
			key := fmt.Sprintf("transition:%s:%s:%s", ev.ID, memberID, tg.tag)
			if !s.markSent(key, now) {
				continue
			}
			tr := texts(prefs.Lang)
			mins := int(leave.Sub(now).Minutes())
			if mins < 1 {
				mins = 1
			}
			title := fmt.Sprintf(tr.transitionTitle, mins, ev.Title)
			body := fmt.Sprintf(tr.transitionBody, whoLine(ev, memberID, names), clock(leave, prefs.Lang), clock(start, prefs.Lang))
			if next := nextAfter(mine, i); next != nil {
				if ns, err := time.Parse(time.RFC3339, next.StartAt); err == nil {
					body += " " + fmt.Sprintf(tr.afterNext, next.Title, clock(ns.In(now.Location()), prefs.Lang))
				}
			} else {
				body += " " + tr.afterNothing
			}
			s.deliver(memberID, payload{Title: title, Body: body, Tag: key})
		}
	}
}

// involvedEvents keeps today's timed events the member attends or is the
// assigned guardian for, in start order (ListEvents is already ordered).
func involvedEvents(events []calendar.Event, memberID string) []calendar.Event {
	var out []calendar.Event
	for _, ev := range events {
		if ev.AllDay {
			continue
		}
		involved := ev.AssignedGuardianID != nil && *ev.AssignedGuardianID == memberID
		for _, a := range ev.AttendeeIDs {
			if a == memberID {
				involved = true
			}
		}
		if involved {
			out = append(out, ev)
		}
	}
	return out
}

func nextAfter(mine []calendar.Event, i int) *calendar.Event {
	if i+1 < len(mine) {
		return &mine[i+1]
	}
	return nil
}

// whoLine names who the trip is for when the member is driving someone else
// ("Marie"), else the event stands on its own.
func whoLine(ev calendar.Event, memberID string, names map[string]string) string {
	if ev.AssignedGuardianID == nil || *ev.AssignedGuardianID != memberID {
		return ""
	}
	for _, a := range ev.AttendeeIDs {
		if a != memberID {
			if n, ok := names[a]; ok {
				return n + " · "
			}
		}
	}
	return ""
}

func (s *Service) memberNames() map[string]string {
	out := map[string]string{}
	members, err := family.NewService(s.db).ListMembers()
	if err != nil {
		return out
	}
	for _, m := range members {
		out[m.ID] = m.Name
	}
	return out
}

func (s *Service) familyLocation() *time.Location {
	var tz string
	_ = s.db.QueryRow(`SELECT COALESCE(timezone, '') FROM family LIMIT 1`).Scan(&tz)
	if tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	return time.Local
}

// inQuietHours checks a possibly midnight-wrapping HH:MM window.
func inQuietHours(now time.Time, start, end string) bool {
	st, err1 := time.Parse("15:04", start)
	en, err2 := time.Parse("15:04", end)
	if err1 != nil || err2 != nil {
		return false
	}
	mins := now.Hour()*60 + now.Minute()
	s, e := st.Hour()*60+st.Minute(), en.Hour()*60+en.Minute()
	if s == e {
		return false
	}
	if s < e {
		return mins >= s && mins < e
	}
	return mins >= s || mins < e
}

// ===== Localized notification texts =====
// Small server-side template set; lang comes from the member's saved prefs
// (captured from the device when they save settings).

type textSet struct {
	briefTitle      string
	briefFirst      string // %s = NOW title
	briefMore       string // %d = remaining count
	briefAnchor     string // %s = event, %s = leave time
	transitionTitle string // %d = minutes, %s = event
	transitionBody  string // %s = who ("Marie · " or ""), %s = leave time, %s = start time
	afterNext       string // %s = next event, %s = its time
	afterNothing    string
}

func texts(lang string) textSet {
	switch lang {
	case "de":
		return textSet{
			briefTitle:      "Guten Morgen — dein Tag",
			briefFirst:      "Zuerst: %s.",
			briefMore:       "Danach noch %d auf der Liste.",
			briefAnchor:     "Fester Punkt: %s — los um %s.",
			transitionTitle: "In %d Min. losfahren: %s",
			transitionBody:  "%sLos um %s — Beginn %s.",
			afterNext:       "Danach: %s um %s.",
			afterNothing:    "Danach ist heute nichts mehr.",
		}
	case "pt-BR", "pt":
		return textSet{
			briefTitle:      "Bom dia — seu dia",
			briefFirst:      "Primeiro: %s.",
			briefMore:       "Depois, mais %d na lista.",
			briefAnchor:     "Ponto fixo: %s — sair às %s.",
			transitionTitle: "Sair em %d min: %s",
			transitionBody:  "%sSair às %s — começa às %s.",
			afterNext:       "Depois: %s às %s.",
			afterNothing:    "Depois disso, nada mais hoje.",
		}
	default:
		return textSet{
			briefTitle:      "Good morning — your day",
			briefFirst:      "First up: %s.",
			briefMore:       "%d more on the list after that.",
			briefAnchor:     "Fixed point: %s — leave by %s.",
			transitionTitle: "In %d min: leave for %s",
			transitionBody:  "%sLeave at %s — starts %s.",
			afterNext:       "After that: %s at %s.",
			afterNothing:    "After that, nothing else today.",
		}
	}
}

// clock renders a time in the language's customary clock (12h for English,
// 24h otherwise).
func clock(t time.Time, lang string) string {
	if lang == "en" || lang == "" {
		return t.Format("3:04 PM")
	}
	return t.Format("15:04")
}

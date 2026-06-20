package calendar

import (
	"errors"
	"time"
)

// Guardian assignment & conflict logic (see docs/roost-data-model.md).
//
// For an event with requires_guardian = true and ≥1 child attendee, recompute
// whenever the event — or any overlapping event/work-schedule for a guardian —
// changes:
//   1. Free guardians = guardians with no overlapping event (as attendee) and
//      no overlapping work-schedule block.
//   2. Exactly one free  → assign them, conflict none.
//   3. Multiple free     → assign the child's default guardian if free, else
//                          leave unassigned (first-claim), conflict none.
//   4. Zero free         → unassigned, conflict needs_guardian.

// GuardianAlert is an upcoming guardian-needed event still lacking an assigned
// guardian — either because none is free (Status "needs_guardian") or because
// several are free and nobody has claimed it yet (Status "unclaimed").
type GuardianAlert struct {
	EventID string
	Title   string
	StartAt string
	AllDay  bool
	Status  string // "needs_guardian" | "unclaimed"
}

// GuardianAlerts lists guardian-needed events overlapping [from, to) that have
// no assigned guardian, ordered by start time. Drives the notification bell.
func (s *Service) GuardianAlerts(from, to time.Time) ([]GuardianAlert, error) {
	rows, err := s.db.Query(
		`SELECT id, title, start_at, all_day, conflict_status
		   FROM event
		  WHERE requires_guardian = 1
		    AND assigned_guardian_id IS NULL
		    AND datetime(start_at) < datetime(?) AND datetime(end_at) > datetime(?)
		  ORDER BY start_at`,
		to.Format(time.RFC3339), from.Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []GuardianAlert{}
	for rows.Next() {
		var a GuardianAlert
		var allDay int
		var conflict string
		if err := rows.Scan(&a.EventID, &a.Title, &a.StartAt, &allDay, &conflict); err != nil {
			return nil, err
		}
		a.AllDay = allDay != 0
		if conflict == "needs_guardian" {
			a.Status = "needs_guardian"
		} else {
			a.Status = "unclaimed"
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// FreeGuardians returns the ids of guardians with no conflicting commitment
// during the event's window — the candidates who can claim an unclaimed event.
func (s *Service) FreeGuardians(eventID string) ([]string, error) {
	var startStr, endStr string
	var allDayInt int
	if err := s.db.QueryRow(`SELECT start_at, end_at, all_day FROM event WHERE id = ?`, eventID).
		Scan(&startStr, &endStr, &allDayInt); err != nil {
		return nil, err
	}
	start, _ := time.Parse(time.RFC3339, startStr)
	end, _ := time.Parse(time.RFC3339, endStr)
	guardians, err := s.guardianIDs()
	if err != nil {
		return nil, err
	}
	free := []string{}
	for _, gid := range guardians {
		ok, err := s.guardianFree(gid, eventID, start, end, allDayInt != 0)
		if err != nil {
			return nil, err
		}
		if ok {
			free = append(free, gid)
		}
	}
	return free, nil
}

// Claim assigns a specific guardian to an event (first-claim, or "assign anyway"
// when force is set despite a conflict). Clears the conflict flag.
func (s *Service) Claim(eventID, memberID string, force bool) error {
	var role string
	if err := s.db.QueryRow(`SELECT role FROM family_member WHERE id = ?`, memberID).Scan(&role); err != nil {
		return errors.New("unknown member")
	}
	if role != "guardian" {
		return errors.New("only guardians can be assigned")
	}
	if !force {
		var startStr, endStr string
		var allDayInt int
		if err := s.db.QueryRow(`SELECT start_at, end_at, all_day FROM event WHERE id = ?`, eventID).
			Scan(&startStr, &endStr, &allDayInt); err != nil {
			return err
		}
		start, _ := time.Parse(time.RFC3339, startStr)
		end, _ := time.Parse(time.RFC3339, endStr)
		free, err := s.guardianFree(memberID, eventID, start, end, allDayInt != 0)
		if err != nil {
			return err
		}
		if !free {
			return errors.New("guardian is not free at this time")
		}
	}
	_, err := s.db.Exec(`UPDATE event SET assigned_guardian_id = ?, conflict_status = 'none' WHERE id = ?`, memberID, eventID)
	return err
}

// recomputeWindow recomputes every guardian-needed event overlapping [start, end].
func (s *Service) recomputeWindow(start, end time.Time) error {
	rows, err := s.db.Query(
		`SELECT id FROM event
		 WHERE requires_guardian = 1 AND datetime(start_at) < datetime(?) AND datetime(end_at) > datetime(?)`,
		end.Format(time.RFC3339), start.Format(time.RFC3339))
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, id := range ids {
		if err := s.recomputeEvent(id); err != nil {
			return err
		}
	}
	return nil
}

// recomputeEvent recomputes and caches one event's assigned_guardian_id and
// conflict_status.
func (s *Service) recomputeEvent(eventID string) error {
	var startStr, endStr string
	var allDayInt, requiresInt int
	if err := s.db.QueryRow(
		`SELECT start_at, end_at, all_day, requires_guardian FROM event WHERE id = ?`, eventID).
		Scan(&startStr, &endStr, &allDayInt, &requiresInt); err != nil {
		return err
	}

	clear := func() error {
		_, err := s.db.Exec(`UPDATE event SET assigned_guardian_id = NULL, conflict_status = 'none' WHERE id = ?`, eventID)
		return err
	}
	if requiresInt == 0 {
		return clear()
	}

	// Child attendees (with their default guardian). No child → nothing to do.
	childRows, err := s.db.Query(
		`SELECT fm.id, fm.default_guardian_id
		 FROM event_attendee ea JOIN family_member fm ON fm.id = ea.member_id
		 WHERE ea.event_id = ? AND fm.role = 'child'`, eventID)
	if err != nil {
		return err
	}
	var defaultGuardians []*string
	hasChild := false
	for childRows.Next() {
		var cid string
		var dg *string
		if err := childRows.Scan(&cid, &dg); err != nil {
			childRows.Close()
			return err
		}
		hasChild = true
		defaultGuardians = append(defaultGuardians, dg)
	}
	childRows.Close()
	if !hasChild {
		return clear()
	}

	start, _ := time.Parse(time.RFC3339, startStr)
	end, _ := time.Parse(time.RFC3339, endStr)
	allDay := allDayInt != 0

	guardians, err := s.guardianIDs()
	if err != nil {
		return err
	}
	var free []string
	for _, gid := range guardians {
		ok, err := s.guardianFree(gid, eventID, start, end, allDay)
		if err != nil {
			return err
		}
		if ok {
			free = append(free, gid)
		}
	}

	var assigned *string
	conflict := "none"
	switch {
	case len(free) == 1:
		assigned = &free[0]
	case len(free) > 1:
		// Prefer the first child's default guardian if they're free.
		if dg := firstDefaultGuardianFree(defaultGuardians, free); dg != nil {
			assigned = dg
		}
		// else leave unassigned for first-claim, conflict none.
	default: // zero free
		conflict = "needs_guardian"
	}

	_, err = s.db.Exec(`UPDATE event SET assigned_guardian_id = ?, conflict_status = ? WHERE id = ?`,
		assigned, conflict, eventID)
	return err
}

func (s *Service) guardianIDs() ([]string, error) {
	rows, err := s.db.Query(`SELECT id FROM family_member WHERE role = 'guardian' ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// guardianFree reports whether a guardian has no overlapping event (as attendee)
// and no overlapping work-schedule block during [start, end].
func (s *Service) guardianFree(guardianID, excludeEventID string, start, end time.Time, allDay bool) (bool, error) {
	// Only timed events make a guardian busy. All-day events here are
	// informational overlays (projected chores, birthdays) that shouldn't block
	// a specific-time guardian assignment.
	var busy int
	if err := s.db.QueryRow(
		`SELECT COUNT(*) FROM event e JOIN event_attendee ea ON ea.event_id = e.id
		 WHERE ea.member_id = ? AND e.id != ? AND e.all_day = 0 AND datetime(e.start_at) < datetime(?) AND datetime(e.end_at) > datetime(?)`,
		guardianID, excludeEventID, end.Format(time.RFC3339), start.Format(time.RFC3339)).Scan(&busy); err != nil {
		return false, err
	}
	if busy > 0 {
		return false, nil
	}

	rows, err := s.db.Query(`SELECT days_of_week, start_time, end_time FROM work_schedule WHERE member_id = ?`, guardianID)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	weekday := (int(start.Weekday()) + 6) % 7 // Mon=0
	evStart := start.Hour()*60 + start.Minute()
	evEnd := end.Hour()*60 + end.Minute()
	for rows.Next() {
		var days, ws, we string
		if err := rows.Scan(&days, &ws, &we); err != nil {
			return false, err
		}
		if weekday >= len(days) || days[weekday] != '1' {
			continue
		}
		if allDay {
			return false, nil // any work that day conflicts with an all-day event
		}
		if minutesOverlap(evStart, evEnd, clockMinutes(ws), clockMinutes(we)) {
			return false, nil
		}
	}
	return true, rows.Err()
}

// firstDefaultGuardianFree returns the first child's default guardian if it is
// in the free set.
func firstDefaultGuardianFree(defaults []*string, free []string) *string {
	freeSet := make(map[string]bool, len(free))
	for _, f := range free {
		freeSet[f] = true
	}
	for _, dg := range defaults {
		if dg != nil && freeSet[*dg] {
			return dg
		}
	}
	return nil
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

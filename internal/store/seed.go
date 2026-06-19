package store

import (
	"database/sql"
	"os"
	"time"

	"tribo/internal/calendar"
	"tribo/internal/chores"
)

// Stable IDs so seeding is idempotent and member ordering stays fixed.
const (
	familyID         = "fam-silva"
	sourcePersonalID = "cal-personal"
	sourceFamilyID   = "cal-family"

	memberAlberto   = "mem-alberto"
	memberHilda     = "mem-hilda"
	memberMarie     = "mem-marie"
	memberGuilherme = "mem-guilherme"
)

// seed populates the Silva family, two internal calendar sources, and a week of
// sample events matching docs/design/roost-week-view.jsx. It runs only when
// TRIBO_SEED=true and the database is empty, so a fresh instance starts clean
// and the onboarding wizard runs by default.
//
// Events are anchored to the Monday of the current week, so the Week view's
// default (current) week always shows data with correct "today" highlighting.
// Recurring-event generation arrives in a later milestone.
func seed(db *sql.DB) error {
	// A fresh instance starts empty so the onboarding wizard runs. Set
	// TRIBO_SEED=true to load the Silva family example data instead.
	if os.Getenv("TRIBO_SEED") != "true" {
		return nil
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM family`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	tz := "Europe/Lisbon"
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
	}
	monday := mondayOf(time.Now().In(loc))

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`INSERT INTO family (id, name, timezone) VALUES (?, ?, ?)`,
		familyID, "The Silva Family", tz); err != nil {
		return err
	}

	members := []struct {
		id, name, color, role string
		defaultGuardian       any
		order                 int
	}{
		{memberAlberto, "Alberto", "#4C7EA8", "guardian", nil, 0},
		{memberHilda, "Hilda", "#D1577A", "guardian", nil, 1},
		{memberMarie, "Marie", "#5C9460", "child", memberHilda, 2},
		{memberGuilherme, "Guilherme", "#8A6BB8", "child", memberAlberto, 3},
	}
	for _, m := range members {
		if _, err := tx.Exec(
			`INSERT INTO family_member (id, family_id, name, color, role, default_guardian_id, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			m.id, familyID, m.name, m.color, m.role, m.defaultGuardian, m.order); err != nil {
			return err
		}
	}
	// Demo the optional profile-switch PIN (data model: "optional PIN for kids").
	if _, err := tx.Exec(`UPDATE family_member SET pin = '1234' WHERE id = ?`, memberMarie); err != nil {
		return err
	}

	if _, err := tx.Exec(
		`INSERT INTO calendar_source (id, type, display_name, is_shared) VALUES
		 (?, 'internal', 'Personal', 0), (?, 'internal', 'Family', 1)`,
		sourcePersonalID, sourceFamilyID); err != nil {
		return err
	}

	// Per-member events: {dayOffset, startHour, startMin, durMin, title, member}.
	type ev struct {
		day, h, m, dur int
		title          string
		member         string
		visibility     string
	}
	personal := []ev{
		// Alberto
		{0, 6, 0, 60, "Gym", memberAlberto, "routine"},
		{2, 6, 0, 60, "Gym", memberAlberto, "routine"},
		{4, 6, 0, 60, "Gym", memberAlberto, "routine"},
		{4, 19, 0, 120, "Date night", memberAlberto, "standard"},
		// Hilda
		{0, 9, 0, 60, "Team meeting", memberHilda, "standard"},
		{3, 15, 30, 60, "Dentist", memberHilda, "standard"},
		{4, 19, 0, 120, "Date night", memberHilda, "standard"},
		// Marie
		{0, 8, 0, 420, "School", memberMarie, "routine"},
		{1, 8, 0, 420, "School", memberMarie, "routine"},
		{1, 16, 0, 90, "Soccer", memberMarie, "routine"},
		{2, 8, 0, 420, "School", memberMarie, "routine"},
		{3, 8, 0, 420, "School", memberMarie, "routine"},
		{3, 16, 0, 90, "Soccer", memberMarie, "routine"},
		{4, 8, 0, 420, "School", memberMarie, "routine"},
		// Guilherme
		{0, 8, 0, 420, "School", memberGuilherme, "routine"},
		{1, 8, 0, 420, "School", memberGuilherme, "routine"},
		{2, 8, 0, 420, "School", memberGuilherme, "routine"},
		{2, 15, 0, 60, "Piano", memberGuilherme, "routine"},
		{3, 8, 0, 420, "School", memberGuilherme, "routine"},
		{4, 8, 0, 420, "School", memberGuilherme, "routine"},
	}

	eventNum := 0
	insertEvent := func(sourceID, title string, start, end time.Time, allDay bool, icon, visibility, externalAttendees string, members ...string) error {
		eventNum++
		id := "evt-seed-" + itoa(eventNum)
		var iconV, extV any
		if icon != "" {
			iconV = icon
		}
		if externalAttendees != "" {
			extV = externalAttendees
		}
		if _, err := tx.Exec(
			`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, icon, visibility_tag, external_attendees)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, sourceID, title, rfc(start), rfc(end), b2i(allDay), iconV, visibility, extV); err != nil {
			return err
		}
		for _, mid := range members {
			if _, err := tx.Exec(`INSERT INTO event_attendee (event_id, member_id) VALUES (?, ?)`, id, mid); err != nil {
				return err
			}
		}
		return nil
	}

	for _, e := range personal {
		start := monday.AddDate(0, 0, e.day).Add(time.Duration(e.h)*time.Hour + time.Duration(e.m)*time.Minute)
		end := start.Add(time.Duration(e.dur) * time.Minute)
		if err := insertEvent(sourcePersonalID, e.title, start, end, false, "", e.visibility, "", e.member); err != nil {
			return err
		}
	}

	// Shared/family events live on the shared calendar source (no member attendees).
	// Grandma's birthday — Thursday, all-day, milestone, external attendee.
	birthdayStart := monday.AddDate(0, 0, 3)
	if err := insertEvent(sourceFamilyID, "Grandma's birthday", birthdayStart, birthdayStart.AddDate(0, 0, 1), true, "cake", "milestone", "Grandma"); err != nil {
		return err
	}
	// Family dinner — Sunday 5:00 PM.
	dinnerStart := monday.AddDate(0, 0, 6).Add(17 * time.Hour)
	if err := insertEvent(sourceFamilyID, "Family dinner", dinnerStart, dinnerStart.Add(2*time.Hour), false, "", "standard", ""); err != nil {
		return err
	}

	// Year-spanning milestones (birthdays + holidays) so the Month/Year views
	// demonstrate the milestone-dot behavior. All-day, visibility=milestone.
	// (Recurrence is modeled as one concrete dated event per year until the
	// recurrence engine lands in a later milestone.)
	year := monday.Year()
	allDay := func(month time.Month, day int) (time.Time, time.Time) {
		s := time.Date(year, month, day, 0, 0, 0, 0, loc)
		return s, s.AddDate(0, 0, 1)
	}
	type milestone struct {
		title  string
		month  time.Month
		day    int
		member string // "" → shared
		icon   string
		ext    string
	}
	milestones := []milestone{
		{"Hilda's birthday", time.March, 10, memberHilda, "cake", ""},
		{"Alberto's birthday", time.April, 15, memberAlberto, "cake", ""},
		{"Guilherme's birthday", time.May, 3, memberGuilherme, "cake", ""},
		{"Marie's birthday", time.November, 8, memberMarie, "cake", ""},
		{"Summer holidays begin", time.June, 26, "", "", ""},
		{"Christmas Day", time.December, 25, "", "", ""},
	}
	for _, ms := range milestones {
		s, e := allDay(ms.month, ms.day)
		src := sourcePersonalID
		var members []string
		if ms.member == "" {
			src = sourceFamilyID
		} else {
			members = []string{ms.member}
		}
		if err := insertEvent(src, ms.title, s, e, true, ms.icon, "milestone", ms.ext, members...); err != nil {
			return err
		}
	}

	// Chores.
	type choreSeed struct {
		id, title, rule, mode, color string
		assigned                     string
		rotation                     any
	}
	choreSeeds := []choreSeed{
		{"chore-mow", "Mow the lawn", "weekly", "fixed", "#4C7EA8", memberAlberto, nil},
		{"chore-bath", "Clean the bathroom", "weekly", "fixed", "#D1577A", memberHilda, nil},
		{"chore-recycle", "Take out recycling", "weekly", "fixed", "#8A6BB8", memberGuilherme, nil},
		{"chore-plants", "Water the plants", "weekly", "fixed", "#5C9460", memberMarie, nil},
		{"chore-table", "Set the table", "daily", "rotation", "#5C9460", "", memberMarie + "," + memberGuilherme},
		{"chore-fridge", "Defrost the fridge", "monthly", "fixed", "#D1577A", memberHilda, nil},
	}
	for i, c := range choreSeeds {
		var assigned any
		if c.assigned != "" {
			assigned = c.assigned
		}
		if _, err := tx.Exec(
			`INSERT INTO chore (id, title, recurrence_rule, assignment_mode, assigned_member_id, rotation_member_ids, color, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			c.id, c.title, c.rule, c.mode, assigned, c.rotation, c.color, i); err != nil {
			return err
		}
	}

	// Work schedules (guardians, Mon–Fri).
	if _, err := tx.Exec(
		`INSERT INTO work_schedule (id, member_id, days_of_week, start_time, end_time, label, show_on_calendar) VALUES
		 (?, ?, '1111100', '09:00', '17:00', 'Work', 0),
		 (?, ?, '1111100', '08:00', '16:00', 'Work', 0)`,
		"ws-alberto", memberAlberto, "ws-hilda", memberHilda); err != nil {
		return err
	}

	// Todos. "Order birthday gift" was completed last week so Home/Review recaps show it.
	lastWeekDone := monday.AddDate(0, 0, -2).Format(time.RFC3339)
	todoSeeds := []struct {
		id, title string
		member    any
		status    string
		completed any
		order     int
	}{
		{"todo-dentist", "Book dentist for Marie", memberMarie, "open", nil, 0},
		{"todo-car", "Renew car registration", nil, "open", nil, 1},
		{"todo-gift", "Order birthday gift", nil, "done", lastWeekDone, 2},
		{"todo-swim", "Pack swim bag for tomorrow", nil, "open", nil, 3},
		{"todo-email", "Reply to school email", nil, "open", nil, 4},
	}
	for _, t := range todoSeeds {
		if _, err := tx.Exec(
			`INSERT INTO todo (id, title, assigned_member_id, status, completed_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			t.id, t.title, t.member, t.status, t.completed, t.order); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Generate chore instances and a realistic completion history (post-commit,
	// so the chores exist for the generator to read).
	if err := seedChoreHistory(db, monday); err != nil {
		return err
	}

	// Flag a couple of child activities as guardian-needed and compute their
	// guardian state, so the calendar demonstrates the feature on first load.
	// Given the seeded work schedules (Alberto 09–17, Hilda 08–16):
	//   • Soccer 16:00–17:30 → only Hilda is free → assigned to Hilda.
	//   • Piano  15:00–16:00 → neither is free   → conflict (needs_guardian).
	if _, err := db.Exec(`UPDATE event SET requires_guardian = 1 WHERE title IN ('Soccer', 'Piano')`); err != nil {
		return err
	}
	return calendar.NewService(db).RecomputeWindow(monday, monday.AddDate(0, 0, 7))
}

// seedChoreHistory generates instances for the past 8 weeks (+ current/next) and
// marks a believable subset done, so the Review heatmap and streaks have data.
// The current week stays pending so the user can check chores off live.
func seedChoreHistory(db *sql.DB, currentMonday time.Time) error {
	svc := chores.NewService(db)
	if _, err := svc.Generate(currentMonday.AddDate(0, 0, -7*9), currentMonday.AddDate(0, 0, 7)); err != nil {
		return err
	}

	today := time.Now()
	todayStr := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location()).Format("2006-01-02")

	// Weekly chores: explicit 7-week histories (oldest → most recent prior week).
	weekly := map[string][]bool{
		"chore-mow":     {true, true, false, true, true, true, true},
		"chore-bath":    {true, true, true, true, true, true, true},
		"chore-recycle": {true, false, true, true, false, true, false},
		"chore-plants":  {true, true, false, true, true, true, false},
	}
	markDone := func(choreID, periodStart string) error {
		_, err := db.Exec(
			`UPDATE chore_instance SET status='done', completed_by=assigned_member_id, completed_at=?
			 WHERE chore_id=? AND period_start=?`,
			periodStart+"T12:00:00Z", choreID, periodStart)
		return err
	}
	for choreID, hist := range weekly {
		for w, done := range hist {
			if !done {
				continue
			}
			weekStart := currentMonday.AddDate(0, 0, -7*(7-w)).Format("2006-01-02")
			if err := markDone(choreID, weekStart); err != nil {
				return err
			}
		}
	}

	// Daily + monthly: mark every fully-elapsed period done (period_end <= today).
	if _, err := db.Exec(
		`UPDATE chore_instance SET status='done', completed_by=assigned_member_id, completed_at=period_start||'T12:00:00Z'
		 WHERE chore_id IN ('chore-table','chore-fridge') AND period_end <= ?`, todayStr); err != nil {
		return err
	}
	return nil
}

// mondayOf returns midnight on the Monday of t's week, in t's location.
func mondayOf(t time.Time) time.Time {
	weekday := int(t.Weekday()) // Sunday = 0
	offset := (weekday + 6) % 7 // days since Monday
	d := t.AddDate(0, 0, -offset)
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, t.Location())
}

func rfc(t time.Time) string { return t.Format(time.RFC3339) }

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

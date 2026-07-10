package focus

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"tribo/internal/store"
)

// fixture: one guardian, a needs-guardian event this afternoon, an overdue
// todo, an important todo, a plain todo, and a pending 5-min chore this week.
func testDB(t *testing.T, now time.Time) *sql.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "focus.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}

	day := now.Format("2006-01-02")
	mustExec(`INSERT INTO family (id, name, timezone) VALUES ('fam', 'F', 'UTC')`)
	mustExec(`INSERT INTO family_member (id, family_id, name, color, role) VALUES ('mem-a', 'fam', 'Alba', '#4F7E91', 'guardian')`)
	mustExec(`INSERT INTO calendar_source (id, type, display_name, is_shared, read_only) VALUES ('src', 'caldav', 'Family', 1, 0)`)

	// Conflict event at 16:00 today; a normal event at 18:00 (anchor candidate).
	mustExec(`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, visibility_tag, requires_guardian, conflict_status)
	          VALUES ('evt-conflict', 'src', 'Piano', ?, ?, 0, 'standard', 1, 'needs_guardian')`,
		day+"T16:00:00Z", day+"T17:00:00Z")
	mustExec(`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, visibility_tag, requires_guardian, conflict_status)
	          VALUES ('evt-dinner', 'src', 'Family dinner', ?, ?, 0, 'standard', 0, 'none')`,
		day+"T18:00:00Z", day+"T19:00:00Z")

	yesterday := now.AddDate(0, 0, -2).Format("2006-01-02")
	mustExec(`INSERT INTO todo (id, title, status, due_date) VALUES ('todo-overdue', 'Renew registration', 'open', ?)`, yesterday)
	mustExec(`INSERT INTO todo (id, title, status, importance) VALUES ('todo-imp', 'Book dentist', 'open', 1)`)
	mustExec(`INSERT INTO todo (id, title, status) VALUES ('todo-plain', 'Reply to email', 'open')`)

	mustExec(`INSERT INTO chore (id, title, recurrence_rule, assignment_mode, assigned_member_id, effort) VALUES ('ch', 'Water plants', 'weekly', 'fixed', 'mem-a', '5min')`)
	mustExec(`INSERT INTO chore_instance (id, chore_id, period_start, period_end, assigned_member_id, status) VALUES ('inst-1', 'ch', ?, ?, 'mem-a', 'pending')`, day, day)
	return db
}

// noon returns today 12:00 UTC so the 16:00/18:00 fixture events are upcoming.
func noon() time.Time {
	n := time.Now().UTC()
	return time.Date(n.Year(), n.Month(), n.Day(), 12, 0, 0, 0, time.UTC)
}

func TestQueueRanking(t *testing.T) {
	now := noon()
	svc := NewService(testDB(t, now))
	q, err := svc.buildQueueAt(now, "", true)
	if err != nil {
		t.Fatalf("buildQueueAt: %v", err)
	}

	if q.Now == nil || q.Now.ID != "evt-conflict" || q.Now.Reason.Code != "needs_guardian" {
		t.Fatalf("NOW should be the conflict event, got %+v", q.Now)
	}
	if len(q.Next) != 2 || q.Next[0].ID != "todo-overdue" || q.Next[1].ID != "todo-imp" {
		t.Fatalf("NEXT should be [overdue, important], got %+v", q.Next)
	}
	if q.Next[0].Reason.Code != "overdue" || q.Next[0].Reason.N != 2 {
		t.Errorf("overdue reason: %+v", q.Next[0].Reason)
	}
	// Later: the chore ranks above the plain todo.
	if q.LaterCount != 2 || len(q.Later) != 2 || q.Later[0].ID != "inst-1" || q.Later[1].ID != "todo-plain" {
		t.Fatalf("LATER should be [chore, plain] (count 2), got count=%d %+v", q.LaterCount, q.Later)
	}
	if q.Later[0].Effort != "5min" {
		t.Errorf("chore effort should ride along, got %q", q.Later[0].Effort)
	}

	// Anchor: the next timed event after noon is the 16:00 conflict; leave 20min before.
	if q.Anchor == nil || q.Anchor.EventID != "evt-conflict" {
		t.Fatalf("anchor should be the 16:00 event, got %+v", q.Anchor)
	}
	leave, _ := time.Parse(time.RFC3339, q.Anchor.LeaveAt)
	if leave.UTC().Format("15:04") != "15:40" {
		t.Errorf("leaveAt should be 15:40 UTC, got %s", q.Anchor.LeaveAt)
	}
}

func TestDeferHidesForToday(t *testing.T) {
	now := noon()
	svc := NewService(testDB(t, now))

	if err := svc.Defer("event", "evt-conflict", "mem-a"); err != nil {
		t.Fatalf("Defer: %v", err)
	}
	q, err := svc.buildQueueAt(now, "", true)
	if err != nil {
		t.Fatal(err)
	}
	if q.Now == nil || q.Now.ID == "evt-conflict" {
		t.Fatalf("deferred event must leave the queue, NOW=%+v", q.Now)
	}
	if q.Now.ID != "todo-overdue" {
		t.Errorf("next-best should take over NOW, got %+v", q.Now)
	}
	// The defer is logged with the member.
	var member string
	if err := svc.db.QueryRow(`SELECT member_id FROM focus_defer WHERE item_id = 'evt-conflict'`).Scan(&member); err != nil || member != "mem-a" {
		t.Errorf("defer log: member=%q err=%v", member, err)
	}

	if err := svc.Defer("bogus", "x", ""); err == nil {
		t.Error("invalid kind must error")
	}
}

func TestMemberScoping(t *testing.T) {
	now := noon()
	db := testDB(t, now)
	// A second member with their own todo + chore; Alba shouldn't see them.
	if _, err := db.Exec(`INSERT INTO family_member (id, family_id, name, color, role) VALUES ('mem-b', 'fam', 'Bo', '#BC6678', 'guardian')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO todo (id, title, status, assigned_member_id, importance) VALUES ('todo-bo', 'Bo thing', 'open', 'mem-b', 1)`); err != nil {
		t.Fatal(err)
	}

	svc := NewService(db)
	q, err := svc.buildQueueAt(now, "mem-a", true)
	if err != nil {
		t.Fatal(err)
	}
	all := append([]Item{}, q.Next...)
	all = append(all, q.Later...)
	if q.Now != nil {
		all = append(all, *q.Now)
	}
	for _, it := range all {
		if it.ID == "todo-bo" {
			t.Errorf("Bo's assigned todo must not appear in Alba's queue")
		}
	}
	// Unassigned items and the conflict event still show for Alba.
	if q.Now == nil || q.Now.ID != "evt-conflict" {
		t.Errorf("conflict event should still lead Alba's queue, got %+v", q.Now)
	}
}

func TestAnchoredTodoRanksByEventTime(t *testing.T) {
	now := noon()
	db := testDB(t, now)
	if _, err := db.Exec(`INSERT INTO todo (id, title, status, anchor_event_id, effort) VALUES ('todo-anchor', 'Pack snacks', 'open', 'evt-dinner', '2min')`); err != nil {
		t.Fatal(err)
	}
	svc := NewService(db)
	q, err := svc.buildQueueAt(now, "", true)
	if err != nil {
		t.Fatal(err)
	}
	// Anchored todo outranks overdue: it's tied to a fixed point today.
	if len(q.Next) < 1 || q.Next[0].ID != "todo-anchor" || q.Next[0].Reason.Code != "before_event" {
		t.Fatalf("anchored todo should be first NEXT, got %+v", q.Next)
	}
	if q.Next[0].At == "" {
		t.Error("anchored todo should carry the event start time")
	}
}

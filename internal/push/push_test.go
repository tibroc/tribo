package push

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"tribo/internal/store"
)

// fixture: one guardian with a subscription, a 16:00 event she's driving
// Marie to (leave 15:40), an 18:00 family dinner she attends, and an open
// due-today todo for the morning brief.
func testService(t *testing.T, now time.Time) (*Service, *[]payload) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "push.db"))
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
	mustExec(`INSERT INTO family_member (id, family_id, name, color, role) VALUES ('mem-kid', 'fam', 'Marie', '#7D9A55', 'child')`)
	mustExec(`INSERT INTO calendar_source (id, type, display_name, is_shared, read_only) VALUES ('src', 'caldav', 'Family', 1, 0)`)
	mustExec(`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, visibility_tag, requires_guardian, conflict_status, assigned_guardian_id)
	          VALUES ('evt-soccer', 'src', 'Soccer pickup', ?, ?, 0, 'standard', 1, 'none', 'mem-a')`,
		day+"T16:00:00Z", day+"T17:00:00Z")
	mustExec(`INSERT INTO event_attendee (event_id, member_id) VALUES ('evt-soccer', 'mem-kid')`)
	mustExec(`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, visibility_tag, requires_guardian, conflict_status)
	          VALUES ('evt-dinner', 'src', 'Family dinner', ?, ?, 0, 'standard', 0, 'none')`,
		day+"T18:00:00Z", day+"T19:00:00Z")
	mustExec(`INSERT INTO event_attendee (event_id, member_id) VALUES ('evt-dinner', 'mem-a')`)
	mustExec(`INSERT INTO todo (id, title, status, due_date) VALUES ('todo-1', 'Pack the bag', 'open', ?)`, day)

	svc := &Service{db: db, public: "test-pub", private: "test-priv", subject: "https://example.test"}
	var sent []payload
	svc.send = func(_ *webpush.Subscription, body []byte) (int, error) {
		var pl payload
		_ = json.Unmarshal(body, &pl)
		sent = append(sent, pl)
		return 201, nil
	}
	if err := svc.Subscribe("mem-a", "https://push.example/ep1", "p256dh-key", "auth-key"); err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	return svc, &sent
}

func at(now time.Time, hh, mm int) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day(), hh, mm, 0, 0, time.UTC)
}

func TestTransitionWarningAndDedupe(t *testing.T) {
	now := time.Now().UTC()
	svc, sent := testService(t, now)

	// Leave = 15:40; the 15-min warning window opens at 15:25.
	svc.tick(at(now, 15, 25))
	if len(*sent) != 1 {
		t.Fatalf("want 1 notification, got %d: %+v", len(*sent), *sent)
	}
	pl := (*sent)[0]
	if !strings.Contains(pl.Title, "Soccer pickup") || !strings.Contains(pl.Title, "15") {
		t.Errorf("title: %q", pl.Title)
	}
	// Body: who it's for, leave time, and what comes after — predictability.
	for _, want := range []string{"Marie", "3:40 PM", "Family dinner"} {
		if !strings.Contains(pl.Body, want) {
			t.Errorf("body missing %q: %q", want, pl.Body)
		}
	}

	// Same minute again and a minute later: deduped.
	svc.tick(at(now, 15, 25))
	svc.tick(at(now, 15, 26))
	if len(*sent) != 1 {
		t.Fatalf("dedupe failed: %d notifications", len(*sent))
	}
}

func TestSecondNudgeOnlyForPickups(t *testing.T) {
	now := time.Now().UTC()
	svc, sent := testService(t, now)
	prefs := svc.GetPrefs("mem-a")
	prefs.SecondNudge = true
	if err := svc.SetPrefs("mem-a", prefs); err != nil {
		t.Fatal(err)
	}

	// 5-min nudge for the pickup she's the guardian of (leave 15:40 → 15:35)…
	svc.tick(at(now, 15, 35))
	if len(*sent) != 1 || !strings.Contains((*sent)[0].Title, "Soccer pickup") {
		t.Fatalf("want pickup nudge, got %+v", *sent)
	}
	// …but no nudge for the dinner she merely attends (leave 17:40 → 17:35).
	*sent = (*sent)[:0]
	svc.tick(at(now, 17, 35))
	if len(*sent) != 0 {
		t.Fatalf("dinner must not get a second nudge: %+v", *sent)
	}
}

func TestMorningBrief(t *testing.T) {
	now := time.Now().UTC()
	svc, sent := testService(t, now)

	svc.tick(at(now, 7, 2))
	if len(*sent) != 1 {
		t.Fatalf("want 1 brief, got %d", len(*sent))
	}
	pl := (*sent)[0]
	// NOW is the unclaimed soccer pickup... actually assigned; queue leads with
	// the due-today todo or the event — assert grounding loosely.
	if pl.Body == "" || !strings.Contains(pl.Title, "morning") && !strings.Contains(pl.Title, "Morning") {
		t.Errorf("brief payload: %+v", pl)
	}
	svc.tick(at(now, 7, 3))
	if len(*sent) != 1 {
		t.Error("brief must send once per day")
	}
}

func TestQuietHoursSuppress(t *testing.T) {
	now := time.Now().UTC()
	svc, sent := testService(t, now)
	prefs := svc.GetPrefs("mem-a")
	prefs.QuietStart, prefs.QuietEnd = "15:00", "16:00" // covers the 15:25 warning
	if err := svc.SetPrefs("mem-a", prefs); err != nil {
		t.Fatal(err)
	}
	svc.tick(at(now, 15, 25))
	if len(*sent) != 0 {
		t.Fatalf("quiet hours must suppress: %+v", *sent)
	}
}

func TestInQuietHours(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		h, m       int
		start, end string
		want       bool
	}{
		{22, 0, "21:00", "07:00", true},  // wrap: evening
		{3, 0, "21:00", "07:00", true},   // wrap: night
		{12, 0, "21:00", "07:00", false}, // wrap: midday
		{12, 0, "09:00", "17:00", true},  // plain window
		{8, 0, "09:00", "17:00", false},
		{5, 0, "05:00", "05:00", false}, // degenerate = off
	}
	for _, c := range cases {
		got := inQuietHours(time.Date(2026, 1, 1, c.h, c.m, 0, 0, base.Location()), c.start, c.end)
		if got != c.want {
			t.Errorf("inQuietHours(%02d:%02d, %s-%s) = %v, want %v", c.h, c.m, c.start, c.end, got, c.want)
		}
	}
}

func TestDeadEndpointPruned(t *testing.T) {
	now := time.Now().UTC()
	svc, _ := testService(t, now)
	svc.send = func(_ *webpush.Subscription, _ []byte) (int, error) { return 410, nil }
	svc.tick(at(now, 15, 25))

	var count int
	_ = svc.db.QueryRow(`SELECT COUNT(*) FROM push_subscription`).Scan(&count)
	if count != 0 {
		t.Errorf("410 endpoint should be pruned, %d subscriptions remain", count)
	}
}

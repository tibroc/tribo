package calsync

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav"
	"github.com/emersion/go-webdav/caldav"

	"tribo/internal/calendar"
)

// Auto-generated calendar content: birthdays (from member DOB) and a projection
// of chore instances. Both are written one-way (Tribo → Radicale) as discrete
// dated all-day events — no RRULE — so display needs no recurrence expansion.

// RefreshBirthdays writes each member's birthday as dated all-day events on the
// Birthdays collection for every year in the synced window, prunes orphans (e.g.
// a cleared DOB or removed member), then refreshes the cache. No-op when Radicale
// is unconfigured.
func (e *Engine) RefreshBirthdays(ctx context.Context) error {
	if !e.radicale.Enabled() {
		return nil
	}
	srcID, coll, ok := e.managedSource("birthdays", "")
	if !ok {
		return nil
	}
	rows, err := e.db.Query(
		`SELECT id, name, COALESCE(color, ''), date_of_birth FROM family_member
		 WHERE date_of_birth IS NOT NULL AND date_of_birth != ''`)
	if err != nil {
		return err
	}
	type bday struct{ id, name, color, dob string }
	var members []bday
	for rows.Next() {
		var b bday
		if err := rows.Scan(&b.id, &b.name, &b.color, &b.dob); err != nil {
			rows.Close()
			return err
		}
		members = append(members, b)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	// Cover every year in the synced window so birthdays show wherever the user
	// has navigated (the window grows on demand — see EnsureWindow).
	winFrom, winTo := e.window()
	desired := map[string]bool{}
	for _, m := range members {
		mo, day, ok := parseMonthDay(m.dob)
		if !ok {
			continue
		}
		for y := winFrom.Year(); y <= winTo.Year(); y++ {
			start := time.Date(y, mo, day, 0, 0, 0, 0, time.UTC)
			ev := calendar.BackendEvent{
				ID:            fmt.Sprintf("bday-%s-%d", m.id, y),
				Title:         m.name + "'s birthday",
				StartAt:       start.Format(time.RFC3339),
				EndAt:         start.AddDate(0, 0, 1).Format(time.RFC3339),
				AllDay:        true,
				VisibilityTag: "milestone",
				Icon:          "cake",
				Color:         m.color,
				AttendeeIDs:   []string{m.id},
			}
			desired[ev.ID] = true
			if err := e.putToCollection(ctx, coll, ev.ID, buildICS(ev, ev.ID)); err != nil {
				return fmt.Errorf("birthday %s: %w", ev.ID, err)
			}
		}
	}
	// Prune birthday objects no longer wanted (cleared DOB, removed member, or a
	// year that dropped out of the window).
	if err := e.reconcileCollection(ctx, coll, "bday-", desired); err != nil {
		return err
	}
	return e.SyncSourceByID(ctx, srcID)
}

// ProjectChores mirrors chore instances in a rolling window onto the Chores
// collection as all-day events, then refreshes the cache. One-way (external
// edits are ignored). No-op when Radicale is unconfigured.
func (e *Engine) ProjectChores(ctx context.Context) error {
	if !e.radicale.Enabled() {
		return nil
	}
	srcID, coll, ok := e.managedSource("chores", "")
	if !ok {
		return nil
	}
	// Project existing instances across the synced window (which grows as the user
	// navigates) so the chores collection tracks what the calendar covers.
	winFrom, winTo := e.window()
	rows, err := e.db.Query(
		`SELECT ci.id, c.title, ci.period_start, ci.period_end, COALESCE(ci.assigned_member_id, ''), COALESCE(c.color, ''), ci.status
		 FROM chore_instance ci JOIN chore c ON c.id = ci.chore_id
		 WHERE ci.period_start >= ? AND ci.period_start < ?`, winFrom.Format(dateFmt), winTo.Format(dateFmt))
	if err != nil {
		return err
	}
	type inst struct{ id, title, start, end, member, color, status string }
	var insts []inst
	for rows.Next() {
		var x inst
		if err := rows.Scan(&x.id, &x.title, &x.start, &x.end, &x.member, &x.color, &x.status); err != nil {
			rows.Close()
			return err
		}
		insts = append(insts, x)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, x := range insts {
		ev := calendar.BackendEvent{
			ID:            "chore-" + x.id,
			Title:         x.title,
			StartAt:       x.start + "T00:00:00Z",
			EndAt:         x.end + "T00:00:00Z",
			AllDay:        true,
			VisibilityTag: "routine",
			Color:         x.color,
			Status:        x.status,
		}
		if x.member != "" {
			ev.AttendeeIDs = []string{x.member}
		}
		if err := e.putToCollection(ctx, coll, ev.ID, buildICS(ev, ev.ID)); err != nil {
			return fmt.Errorf("chore %s: %w", ev.ID, err)
		}
	}
	// Prune chore objects whose instance no longer exists. Reconcile against ALL
	// instance ids (not just the window) so valid out-of-window objects survive.
	desired, err := e.allChoreUIDs()
	if err != nil {
		return err
	}
	if err := e.reconcileCollection(ctx, coll, "chore-", desired); err != nil {
		return err
	}
	// Chores are published to Radicale only — they are not pulled into the event
	// cache (the calendar shows events + birthdays; chores live on the Chores
	// page). Drop any chore-source rows a prior sync may have left in the cache.
	if _, err := e.db.Exec(`DELETE FROM event WHERE calendar_source_id = ?`, srcID); err != nil {
		return err
	}
	return nil
}

// allChoreUIDs returns the set of chore object UIDs that should exist on Radicale
// (one per chore_instance row), for reconciliation/pruning.
func (e *Engine) allChoreUIDs() (map[string]bool, error) {
	rows, err := e.db.Query(`SELECT id FROM chore_instance`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out["chore-"+id] = true
	}
	return out, rows.Err()
}

// reconcileCollection deletes objects in a managed collection whose UID starts
// with prefix but is not in the desired set (orphan cleanup). Best-effort.
func (e *Engine) reconcileCollection(ctx context.Context, collURL, prefix string, desired map[string]bool) error {
	u, err := url.Parse(collURL)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, calDAVTimeout)
	defer cancel()
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, e.radicale.Username, e.radicale.Password)
	wc, err := webdav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}
	entries, err := wc.ReadDir(ctx, u.Path, false)
	if err != nil {
		return err
	}
	for _, fi := range entries {
		if fi.IsDir {
			continue
		}
		uid := strings.TrimSuffix(path.Base(fi.Path), ".ics")
		if strings.HasPrefix(uid, prefix) && !desired[uid] {
			_ = e.deleteFromCollection(ctx, collURL, uid)
		}
	}
	return nil
}

const dateFmt = "2006-01-02"

func parseMonthDay(dob string) (time.Month, int, bool) {
	t, err := time.Parse(dateFmt, dob)
	if err != nil {
		return 0, 0, false
	}
	return t.Month(), t.Day(), true
}

// putToCollection PUTs an iCalendar object to a managed collection using the
// env-configured Radicale credentials.
func (e *Engine) putToCollection(ctx context.Context, collURL, uid string, cal *ical.Calendar) error {
	u, err := url.Parse(collURL)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, calDAVTimeout)
	defer cancel()
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, e.radicale.Username, e.radicale.Password)
	client, err := caldav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}
	_, err = client.PutCalendarObject(ctx, objectPath(u.Path, uid), cal)
	return err
}

func (e *Engine) deleteFromCollection(ctx context.Context, collURL, uid string) error {
	u, err := url.Parse(collURL)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, calDAVTimeout)
	defer cancel()
	httpc := webdav.HTTPClientWithBasicAuth(http.DefaultClient, e.radicale.Username, e.radicale.Password)
	wc, err := webdav.NewClient(httpc, u.Scheme+"://"+u.Host)
	if err != nil {
		return err
	}
	return wc.RemoveAll(ctx, objectPath(u.Path, uid))
}

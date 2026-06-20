package calsync

import (
	"context"
	"log"
	"time"

	"tribo/internal/calendar"
)

// MigrateInternalToRadicale moves events still on legacy 'internal' calendar
// sources onto the managed Radicale collections — a single-attendee event to
// that person's calendar, anything else to the family calendar — then removes
// the internal sources. Runs once at startup; a no-op when no internal sources
// remain (or Radicale is unconfigured).
func (e *Engine) MigrateInternalToRadicale(ctx context.Context) error {
	if !e.radicale.Enabled() {
		return nil
	}
	internal, err := e.internalSourceIDs()
	if err != nil || len(internal) == 0 {
		return err
	}
	familyID, _, ok := e.managedSource("family", "")
	if !ok {
		return nil // can't migrate without a target; leave data in place
	}

	cal := calendar.NewService(e.db, nil)
	events, err := cal.ListEvents(time.Time{}, time.Time{})
	if err != nil {
		return err
	}
	migrated := 0
	for _, ev := range events {
		if !internal[ev.CalendarSourceID] {
			continue
		}
		target := familyID
		if len(ev.AttendeeIDs) == 1 {
			if pid, _, ok := e.managedSource("person", ev.AttendeeIDs[0]); ok {
				target = pid
			}
		}
		if _, err := e.PutEvent(ctx, calendar.BackendEvent{
			ID:               ev.ID,
			SourceID:         target,
			Title:            ev.Title,
			Description:      ptr(ev.Description),
			Location:         ptr(ev.Location),
			StartAt:          ev.StartAt,
			EndAt:            ev.EndAt,
			AllDay:           ev.AllDay,
			VisibilityTag:    ev.VisibilityTag,
			RequiresGuardian: ev.RequiresGuardian,
			Icon:             ptr(ev.Icon),
			Color:            ptr(ev.ColorOverride),
			AttendeeIDs:      ev.AttendeeIDs,
		}); err != nil {
			log.Printf("calsync: migrate event %s: %v", ev.ID, err)
			continue
		}
		migrated++
	}

	for id := range internal {
		if err := e.DeleteSource(id); err != nil {
			return err
		}
	}
	e.SyncAll(ctx) // repopulate the cache from the managed collections
	log.Printf("calsync: migrated %d event(s) off legacy internal sources to Radicale", migrated)
	return nil
}

func (e *Engine) internalSourceIDs() (map[string]bool, error) {
	rows, err := e.db.Query(`SELECT id FROM calendar_source WHERE type = 'internal'`)
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
		out[id] = true
	}
	return out, rows.Err()
}

func ptr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

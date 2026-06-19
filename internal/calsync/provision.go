package calsync

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// Managed-calendar colors (fallbacks; person calendars use the member's color).
const (
	colorFamily    = "#D2982E"
	colorBirthdays = "#BC5E3C"
	colorChores    = "#6E8C82"
)

type memberRow struct {
	id, name, color string
}

// EnsureManagedCalendars provisions the Radicale collections Tribo owns — the
// shared family/birthdays/chores calendars plus one per family member — and
// upserts a managed calendar_source row for each. Idempotent: safe to run on
// every startup and after a member is added. No-op when Radicale is unconfigured.
func (e *Engine) EnsureManagedCalendars(ctx context.Context) error {
	if !e.radicale.Enabled() {
		return nil
	}

	fixed := []struct {
		kind, name, display, color string
	}{
		{"family", "family", "Family", colorFamily},
		{"birthdays", "birthdays", "Birthdays", colorBirthdays},
		{"chores", "chores", "Chores", colorChores},
	}
	for _, f := range fixed {
		if err := e.ensureManagedSource(ctx, f.kind, "", f.name, f.display, f.color, true); err != nil {
			return err
		}
	}

	members, err := e.managedMembers()
	if err != nil {
		return err
	}
	for _, m := range members {
		if err := e.ensureManagedSource(ctx, "person", m.id, "person-"+m.id, m.name, m.color, false); err != nil {
			return err
		}
	}
	return nil
}

// managedMembers reads the member list fully (closing the rows) before any
// follow-up queries, since the store pins a single SQLite connection.
func (e *Engine) managedMembers() ([]memberRow, error) {
	rows, err := e.db.Query(`SELECT id, name, COALESCE(color, '') FROM family_member ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []memberRow
	for rows.Next() {
		var m memberRow
		if err := rows.Scan(&m.id, &m.name, &m.color); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ensureManagedSource creates the collection (idempotent) and upserts the
// managed calendar_source row identified by (kind, member_id). Managed rows use
// the env-configured Radicale credentials, refreshed here so env rotation wins.
func (e *Engine) ensureManagedSource(ctx context.Context, kind, memberID, collName, display, color string, shared bool) error {
	collURL := e.radicale.collectionURL(collName)
	if err := e.mkCalendar(ctx, collURL, display, color); err != nil {
		return fmt.Errorf("provision %s: %w", collName, err)
	}
	enc, err := e.encrypt(creds{Username: e.radicale.Username, Password: e.radicale.Password})
	if err != nil {
		return err
	}

	var id string
	err = e.db.QueryRow(
		`SELECT id FROM calendar_source WHERE managed = 1 AND kind = ? AND COALESCE(member_id, '') = ?`,
		kind, memberID).Scan(&id)
	switch err {
	case nil:
		_, err = e.db.Exec(
			`UPDATE calendar_source SET display_name = ?, url = ?, credentials = ?, is_shared = ?, read_only = 0, member_id = ? WHERE id = ?`,
			display, collURL, enc, b2i(shared), nullable(memberID), id)
		return err
	case sql.ErrNoRows:
		_, err = e.db.Exec(
			`INSERT INTO calendar_source (id, type, display_name, is_shared, url, credentials, read_only, kind, member_id, managed)
			 VALUES (?, 'caldav', ?, ?, ?, ?, 0, ?, ?, 1)`,
			uuid.NewString(), display, b2i(shared), collURL, enc, kind, nullable(memberID))
		return err
	default:
		return err
	}
}

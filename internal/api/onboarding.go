package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type onboardMember struct {
	Name                 string `json:"name"`
	Color                string `json:"color"`
	Role                 string `json:"role"`
	DefaultGuardianIndex *int   `json:"defaultGuardianIndex"`
}

type onboardChore struct {
	Title                 string `json:"title"`
	Recurrence            string `json:"recurrence"`
	Interval              int    `json:"interval"`
	Mode                  string `json:"mode"`
	Color                 string `json:"color"`
	AssignedMemberIndex   *int   `json:"assignedMemberIndex"`
	RotationMemberIndices []int  `json:"rotationMemberIndices"`
}

type onboardPattern struct {
	MemberIndex int    `json:"memberIndex"`
	Title       string `json:"title"`
	StartTime   string `json:"startTime"` // HH:MM
	Weekdays    []int  `json:"weekdays"`  // 0=Mon..6=Sun
	DurationMin int    `json:"durationMin"`
}

type onboardRequest struct {
	FamilyName  string           `json:"familyName"`
	Timezone    string           `json:"timezone"`
	Members     []onboardMember  `json:"members"`
	Chores      []onboardChore   `json:"chores"`
	TypicalWeek []onboardPattern `json:"typicalWeek"`
}

// POST /api/onboarding — one-shot setup from the wizard. Creates the family,
// members, the two internal calendar sources (if absent), starter chores, and a
// typical week of recurring events, then generates this period's chore instances.
func (s *Server) handleOnboarding(w http.ResponseWriter, r *http.Request) {
	var in onboardRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if len(in.Members) == 0 {
		writeError(w, http.StatusBadRequest, "at least one family member is required")
		return
	}
	if in.Timezone == "" {
		in.Timezone = "UTC"
	}
	loc, err := time.LoadLocation(in.Timezone)
	if err != nil {
		loc = time.UTC
	}

	tx, err := s.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	// Family (upsert the single row).
	var familyID string
	if err := tx.QueryRow(`SELECT id FROM family LIMIT 1`).Scan(&familyID); err != nil {
		familyID = uuid.NewString()
		if _, err := tx.Exec(`INSERT INTO family (id, name, timezone) VALUES (?, ?, ?)`, familyID, orDefault(in.FamilyName, "Our Family"), in.Timezone); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		if _, err := tx.Exec(`UPDATE family SET name = ?, timezone = ? WHERE id = ?`, orDefault(in.FamilyName, "Our Family"), in.Timezone, familyID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// Members (two passes so default guardians can reference later members).
	var baseOrder int
	_ = tx.QueryRow(`SELECT COALESCE(MAX(sort_order)+1, 0) FROM family_member`).Scan(&baseOrder)
	memberIDs := make([]string, len(in.Members))
	for i, m := range in.Members {
		if strings.TrimSpace(m.Name) == "" {
			writeError(w, http.StatusBadRequest, "member name is required")
			return
		}
		role := m.Role
		if role != "guardian" && role != "child" {
			role = "guardian"
		}
		memberIDs[i] = uuid.NewString()
		if _, err := tx.Exec(
			`INSERT INTO family_member (id, family_id, name, color, role, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
			memberIDs[i], familyID, m.Name, orDefault(m.Color, "#3E6259"), role, baseOrder+i); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	for i, m := range in.Members {
		if m.DefaultGuardianIndex != nil && *m.DefaultGuardianIndex >= 0 && *m.DefaultGuardianIndex < len(memberIDs) {
			if _, err := tx.Exec(`UPDATE family_member SET default_guardian_id = ? WHERE id = ?`, memberIDs[*m.DefaultGuardianIndex], memberIDs[i]); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}

	// Internal calendar sources (create if absent).
	personalID, err := ensureSource(tx, "Personal", false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := ensureSource(tx, "Family", true); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Starter chores.
	for i, c := range in.Chores {
		if strings.TrimSpace(c.Title) == "" {
			continue
		}
		mode := c.Mode
		if mode != "rotation" {
			mode = "fixed"
		}
		var assigned any
		if mode == "fixed" && c.AssignedMemberIndex != nil && *c.AssignedMemberIndex < len(memberIDs) {
			assigned = memberIDs[*c.AssignedMemberIndex]
		}
		var rotation any
		if mode == "rotation" && len(c.RotationMemberIndices) > 0 {
			ids := make([]string, 0, len(c.RotationMemberIndices))
			for _, idx := range c.RotationMemberIndices {
				if idx >= 0 && idx < len(memberIDs) {
					ids = append(ids, memberIDs[idx])
				}
			}
			rotation = strings.Join(ids, ",")
		}
		interval := c.Interval
		if interval < 1 {
			interval = 1
		}
		if _, err := tx.Exec(
			`INSERT INTO chore (id, title, recurrence_rule, recurrence_interval, assignment_mode, assigned_member_id, rotation_member_ids, color, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			uuid.NewString(), c.Title, orDefault(c.Recurrence, "weekly"), interval, mode, assigned, rotation, orDefault(c.Color, "#3E6259"), i); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// Typical week → recurring events materialized for the current week.
	monday := mondayOf(time.Now().In(loc))
	for _, p := range in.TypicalWeek {
		if p.MemberIndex < 0 || p.MemberIndex >= len(memberIDs) || strings.TrimSpace(p.Title) == "" {
			continue
		}
		hh, mm := parseClock(p.StartTime)
		dur := p.DurationMin
		if dur <= 0 {
			dur = 60
		}
		for _, wd := range p.Weekdays {
			if wd < 0 || wd > 6 {
				continue
			}
			start := monday.AddDate(0, 0, wd).Add(time.Duration(hh)*time.Hour + time.Duration(mm)*time.Minute)
			end := start.Add(time.Duration(dur) * time.Minute)
			eid := uuid.NewString()
			if _, err := tx.Exec(
				`INSERT INTO event (id, calendar_source_id, title, start_at, end_at, all_day, recurrence_rule, visibility_tag)
				 VALUES (?, ?, ?, ?, ?, 0, 'FREQ=WEEKLY', 'routine')`,
				eid, personalID, p.Title, start.Format(time.RFC3339), end.Format(time.RFC3339)); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if _, err := tx.Exec(`INSERT INTO event_attendee (event_id, member_id) VALUES (?, ?)`, eid, memberIDs[p.MemberIndex]); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Generate this period's chore instances so Home/Chores are populated.
	if _, err := s.chores.Generate(time.Now(), time.Now()); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "ready"})
}

// ensureSource returns the id of an internal source matching is_shared, creating
// it if none exists.
func ensureSource(tx *sql.Tx, name string, shared bool) (string, error) {
	b := 0
	if shared {
		b = 1
	}
	var id string
	if err := tx.QueryRow(`SELECT id FROM calendar_source WHERE type = 'internal' AND is_shared = ? LIMIT 1`, b).Scan(&id); err == nil {
		return id, nil
	}
	id = uuid.NewString()
	_, err := tx.Exec(`INSERT INTO calendar_source (id, type, display_name, is_shared) VALUES (?, 'internal', ?, ?)`, id, name, b)
	return id, err
}

func orDefault(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func parseClock(hhmm string) (int, int) {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 9, 0
	}
	return t.Hour(), t.Minute()
}

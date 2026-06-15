// Package family owns family-member data and queries. Both the REST API and the
// MCP server call into here — business logic lives once.
package family

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/google/uuid"
)

type Member struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Color             string  `json:"color"`
	Role              string  `json:"role"` // "guardian" | "child"
	DefaultGuardianID *string `json:"defaultGuardianId,omitempty"`
}

// WorkSchedule is a guardian's recurring availability block (used for
// conflict-checking; rendered on the calendar only if show_on_calendar).
type WorkSchedule struct {
	ID             string `json:"id"`
	MemberID       string `json:"memberId"`
	DaysOfWeek     string `json:"daysOfWeek"` // 7 chars Mon..Sun, e.g. "1111100"
	StartTime      string `json:"startTime"`  // "HH:MM"
	EndTime        string `json:"endTime"`
	Label          string `json:"label"`
	ShowOnCalendar bool   `json:"showOnCalendar"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

// MemberInput is the payload for adding/updating a member. On update, a nil Pin
// leaves the PIN unchanged; a non-nil empty Pin clears it.
type MemberInput struct {
	Name              string  `json:"name"`
	Color             string  `json:"color"`
	Role              string  `json:"role"`
	DefaultGuardianID *string `json:"defaultGuardianId"`
	Pin               *string `json:"pin"`
}

func (s *Service) AddMember(in MemberInput) (*Member, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, errors.New("name is required")
	}
	if in.Role != "guardian" && in.Role != "child" {
		in.Role = "guardian"
	}
	var familyID string
	if err := s.db.QueryRow(`SELECT id FROM family LIMIT 1`).Scan(&familyID); err != nil {
		return nil, errors.New("no family configured")
	}
	var order int
	_ = s.db.QueryRow(`SELECT COALESCE(MAX(sort_order)+1, 0) FROM family_member`).Scan(&order)
	id := uuid.NewString()
	if _, err := s.db.Exec(
		`INSERT INTO family_member (id, family_id, name, color, role, default_guardian_id, pin, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, familyID, in.Name, orDefault(in.Color, "#3E6259"), in.Role, in.DefaultGuardianID, in.Pin, order); err != nil {
		return nil, err
	}
	return s.getMember(id)
}

func (s *Service) UpdateMember(id string, in MemberInput) (*Member, error) {
	if strings.TrimSpace(in.Name) == "" {
		return nil, errors.New("name is required")
	}
	if in.Role != "guardian" && in.Role != "child" {
		in.Role = "guardian"
	}
	if _, err := s.db.Exec(
		`UPDATE family_member SET name = ?, color = ?, role = ?, default_guardian_id = ? WHERE id = ?`,
		in.Name, in.Color, in.Role, in.DefaultGuardianID, id); err != nil {
		return nil, err
	}
	if in.Pin != nil {
		var pin any
		if *in.Pin != "" {
			pin = *in.Pin
		}
		if _, err := s.db.Exec(`UPDATE family_member SET pin = ? WHERE id = ?`, pin, id); err != nil {
			return nil, err
		}
	}
	return s.getMember(id)
}

// DeleteMember removes a member; fails clearly if they're still referenced.
func (s *Service) DeleteMember(id string) error {
	if _, err := s.db.Exec(`DELETE FROM family_member WHERE id = ?`, id); err != nil {
		return errors.New("can't remove a member still linked to events or chores — reassign those first")
	}
	return nil
}

func (s *Service) getMember(id string) (*Member, error) {
	var m Member
	err := s.db.QueryRow(`SELECT id, name, color, role, default_guardian_id FROM family_member WHERE id = ?`, id).
		Scan(&m.ID, &m.Name, &m.Color, &m.Role, &m.DefaultGuardianID)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func orDefault(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

// ListMembers returns family members in display order.
func (s *Service) ListMembers() ([]Member, error) {
	rows, err := s.db.Query(
		`SELECT id, name, color, role, default_guardian_id
		 FROM family_member ORDER BY sort_order`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.Name, &m.Color, &m.Role, &m.DefaultGuardianID); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

type WorkScheduleInput struct {
	MemberID       string `json:"memberId"`
	DaysOfWeek     string `json:"daysOfWeek"` // 7 chars Mon..Sun
	StartTime      string `json:"startTime"`
	EndTime        string `json:"endTime"`
	Label          string `json:"label"`
	ShowOnCalendar bool   `json:"showOnCalendar"`
}

func (in WorkScheduleInput) valid() error {
	if in.MemberID == "" {
		return errors.New("memberId is required")
	}
	if len(in.DaysOfWeek) != 7 {
		return errors.New("daysOfWeek must be 7 characters (Mon..Sun)")
	}
	return nil
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func (s *Service) AddWorkSchedule(in WorkScheduleInput) (*WorkSchedule, error) {
	if err := in.valid(); err != nil {
		return nil, err
	}
	id := uuid.NewString()
	if _, err := s.db.Exec(
		`INSERT INTO work_schedule (id, member_id, days_of_week, start_time, end_time, label, show_on_calendar)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, in.MemberID, in.DaysOfWeek, in.StartTime, in.EndTime, orDefault(in.Label, "Work"), b2i(in.ShowOnCalendar)); err != nil {
		return nil, err
	}
	return s.getWorkSchedule(id)
}

func (s *Service) UpdateWorkSchedule(id string, in WorkScheduleInput) (*WorkSchedule, error) {
	if err := in.valid(); err != nil {
		return nil, err
	}
	if _, err := s.db.Exec(
		`UPDATE work_schedule SET member_id = ?, days_of_week = ?, start_time = ?, end_time = ?, label = ?, show_on_calendar = ? WHERE id = ?`,
		in.MemberID, in.DaysOfWeek, in.StartTime, in.EndTime, orDefault(in.Label, "Work"), b2i(in.ShowOnCalendar), id); err != nil {
		return nil, err
	}
	return s.getWorkSchedule(id)
}

func (s *Service) DeleteWorkSchedule(id string) error {
	_, err := s.db.Exec(`DELETE FROM work_schedule WHERE id = ?`, id)
	return err
}

func (s *Service) getWorkSchedule(id string) (*WorkSchedule, error) {
	var ws WorkSchedule
	var show int
	err := s.db.QueryRow(`SELECT id, member_id, days_of_week, start_time, end_time, label, show_on_calendar FROM work_schedule WHERE id = ?`, id).
		Scan(&ws.ID, &ws.MemberID, &ws.DaysOfWeek, &ws.StartTime, &ws.EndTime, &ws.Label, &show)
	if err != nil {
		return nil, err
	}
	ws.ShowOnCalendar = show != 0
	return &ws, nil
}

// SetWorkScheduleVisibility toggles whether a schedule shows as a busy stripe.
func (s *Service) SetWorkScheduleVisibility(id string, show bool) error {
	v := 0
	if show {
		v = 1
	}
	res, err := s.db.Exec(`UPDATE work_schedule SET show_on_calendar = ? WHERE id = ?`, v, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ListWorkSchedules returns all guardian work schedules.
func (s *Service) ListWorkSchedules() ([]WorkSchedule, error) {
	rows, err := s.db.Query(
		`SELECT id, member_id, days_of_week, start_time, end_time, label, show_on_calendar
		 FROM work_schedule ORDER BY member_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []WorkSchedule{}
	for rows.Next() {
		var ws WorkSchedule
		var show int
		if err := rows.Scan(&ws.ID, &ws.MemberID, &ws.DaysOfWeek, &ws.StartTime, &ws.EndTime, &ws.Label, &show); err != nil {
			return nil, err
		}
		ws.ShowOnCalendar = show != 0
		out = append(out, ws)
	}
	return out, rows.Err()
}

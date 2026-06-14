// Package family owns family-member data and queries. Both the REST API and the
// MCP server call into here — business logic lives once.
package family

import "database/sql"

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

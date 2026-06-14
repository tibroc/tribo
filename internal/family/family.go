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

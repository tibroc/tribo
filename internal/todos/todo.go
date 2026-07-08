// Package todos owns loose to-do items. Both the REST API and MCP server call
// into here.
package todos

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Todo struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Description      *string `json:"description,omitempty"`
	AssignedMemberID *string `json:"assignedMemberId,omitempty"` // null = family-wide
	DueDate          *string `json:"dueDate,omitempty"`          // YYYY-MM-DD
	Status           string  `json:"status"`                     // open | done
	CompletedAt      *string `json:"completedAt,omitempty"`
}

type NewTodo struct {
	Title            string  `json:"title"`
	AssignedMemberID *string `json:"assignedMemberId"`
	DueDate          *string `json:"dueDate"`
}

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

func (s *Service) List() ([]Todo, error) {
	rows, err := s.db.Query(
		`SELECT id, title, description, assigned_member_id, due_date, status, completed_at
		 FROM todo ORDER BY status, sort_order, title`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Todo{}
	for rows.Next() {
		var t Todo
		if err := rows.Scan(&t.ID, &t.Title, &t.Description, &t.AssignedMemberID, &t.DueDate, &t.Status, &t.CompletedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Service) Create(in NewTodo) (*Todo, error) {
	if strings.TrimSpace(in.Title) == "" {
		return nil, errors.New("title is required")
	}
	id := uuid.NewString()
	if _, err := s.db.Exec(
		`INSERT INTO todo (id, title, assigned_member_id, due_date, status) VALUES (?, ?, ?, ?, 'open')`,
		id, in.Title, in.AssignedMemberID, in.DueDate); err != nil {
		return nil, err
	}
	return s.get(id)
}

// SetStatus toggles a todo between open and done, stamping completed_at.
func (s *Service) SetStatus(id, status string) (*Todo, error) {
	if status != "open" && status != "done" {
		return nil, errors.New("status must be open or done")
	}
	var completedAt any
	if status == "done" {
		completedAt = time.Now().Format(time.RFC3339)
	}
	res, err := s.db.Exec(`UPDATE todo SET status = ?, completed_at = ? WHERE id = ?`, status, completedAt, id)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, errors.New("todo not found")
	}
	return s.get(id)
}

// Patch applies an optional title, assignee, and/or status change in a single
// transaction. A nil pointer leaves that field unchanged. Validation runs before
// any write, so an invalid value can't leave a half-applied field behind.
func (s *Service) Patch(id string, title, status, assignedMemberID *string) (*Todo, error) {
	if title == nil && status == nil && assignedMemberID == nil {
		return nil, errors.New("nothing to update")
	}
	if title != nil && strings.TrimSpace(*title) == "" {
		return nil, errors.New("title is required")
	}
	if status != nil && *status != "open" && *status != "done" {
		return nil, errors.New("status must be open or done")
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if title != nil {
		res, err := tx.Exec(`UPDATE todo SET title = ? WHERE id = ?`, strings.TrimSpace(*title), id)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, errors.New("todo not found")
		}
	}
	if assignedMemberID != nil {
		var v any
		if strings.TrimSpace(*assignedMemberID) != "" {
			v = *assignedMemberID
		}
		res, err := tx.Exec(`UPDATE todo SET assigned_member_id = ? WHERE id = ?`, v, id)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, errors.New("todo not found")
		}
	}
	if status != nil {
		var completedAt any
		if *status == "done" {
			completedAt = time.Now().Format(time.RFC3339)
		}
		res, err := tx.Exec(`UPDATE todo SET status = ?, completed_at = ? WHERE id = ?`, *status, completedAt, id)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, errors.New("todo not found")
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.get(id)
}

// Delete removes a todo outright.
func (s *Service) Delete(id string) error {
	res, err := s.db.Exec(`DELETE FROM todo WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("todo not found")
	}
	return nil
}

func (s *Service) get(id string) (*Todo, error) {
	var t Todo
	err := s.db.QueryRow(
		`SELECT id, title, description, assigned_member_id, due_date, status, completed_at FROM todo WHERE id = ?`, id).
		Scan(&t.ID, &t.Title, &t.Description, &t.AssignedMemberID, &t.DueDate, &t.Status, &t.CompletedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

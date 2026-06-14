// Package store owns the SQLite connection, schema migrations, and seed data.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite" // pure-Go SQLite driver (no cgo)
)

// Open opens (creating if needed) the SQLite database at path, enables foreign
// keys, and runs migrations followed by idempotent seeding.
func Open(path string) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// SQLite handles one writer at a time; keep a single connection to avoid
	// "database is locked" under concurrent requests.
	db.SetMaxOpenConns(1)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	if err := seed(db); err != nil {
		return nil, fmt.Errorf("seed: %w", err)
	}
	return db, nil
}

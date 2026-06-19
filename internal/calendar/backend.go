package calendar

import "context"

// EventBackend persists events to the CalDAV system of record (Radicale).
// Implemented by calsync.Engine and injected into Service. It may be nil for
// read/recompute-only services (seed, the sync engine's own recompute pass).
type EventBackend interface {
	// PutEvent writes the event to its owning source's collection and returns the
	// external id (CalDAV UID). For non-CalDAV / legacy "internal" sources it
	// returns ("", nil) so the event is kept cache-only.
	PutEvent(ctx context.Context, in BackendEvent) (externalID string, err error)
	// DeleteEvent removes the object from its source's collection. No-op for
	// non-CalDAV sources or an empty externalID.
	DeleteEvent(ctx context.Context, sourceID, externalID string) error
}

// BackendEvent is the data needed to serialize an event to iCalendar, including
// the Tribo-specific fields carried as X-TRIBO-* properties so the cache can be
// rebuilt from Radicale (SQLite is disposable).
type BackendEvent struct {
	ID               string // cache id; also the CalDAV UID for new objects
	ExternalID       string // existing UID on update; "" on create
	SourceID         string
	Title            string
	Description      string
	Location         string
	StartAt          string // RFC3339
	EndAt            string
	AllDay           bool
	VisibilityTag    string
	RequiresGuardian bool
	Icon             string
	Color            string
	AttendeeIDs      []string // family-member ids
}

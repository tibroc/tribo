-- Milestone 1 schema: Family, FamilyMember, CalendarSource, Event, EventAttendee.
-- Single-family instance; flat relational tables, SQLite-friendly types.

CREATE TABLE family (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC'
);

CREATE TABLE family_member (
    id                  TEXT PRIMARY KEY,
    family_id           TEXT NOT NULL REFERENCES family(id),
    name                TEXT NOT NULL,
    color               TEXT NOT NULL,                        -- hex, drives chip/dot/avatar colors
    role                TEXT NOT NULL CHECK (role IN ('guardian', 'child')),
    oidc_subject        TEXT,
    pin                 TEXT,
    default_guardian_id TEXT REFERENCES family_member(id),    -- only set on child rows
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE calendar_source (
    id             TEXT PRIMARY KEY,
    type           TEXT NOT NULL CHECK (type IN ('internal', 'caldav', 'google')),
    display_name   TEXT NOT NULL,
    is_shared      INTEGER NOT NULL DEFAULT 0,                -- 1 = family/shared row (no per-member attendees)
    url            TEXT,
    credentials    TEXT,
    read_only      INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT
);

CREATE TABLE event (
    id                  TEXT PRIMARY KEY,
    calendar_source_id  TEXT NOT NULL REFERENCES calendar_source(id),
    title               TEXT NOT NULL,
    description         TEXT,
    location            TEXT,
    start_at            TEXT NOT NULL,                        -- RFC3339 timestamp
    end_at              TEXT NOT NULL,
    all_day             INTEGER NOT NULL DEFAULT 0,
    recurrence_rule     TEXT,
    external_id         TEXT,
    icon                TEXT,
    color_override      TEXT,
    visibility_tag      TEXT NOT NULL DEFAULT 'standard'
                        CHECK (visibility_tag IN ('routine', 'standard', 'milestone')),
    requires_guardian   INTEGER NOT NULL DEFAULT 0,
    assigned_guardian_id TEXT REFERENCES family_member(id),   -- computed (later milestones)
    conflict_status     TEXT NOT NULL DEFAULT 'none'
                        CHECK (conflict_status IN ('none', 'needs_guardian')),
    external_attendees  TEXT                                  -- comma-separated names, e.g. "Grandma"
);

CREATE INDEX idx_event_start_at ON event(start_at);

CREATE TABLE event_attendee (
    event_id  TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES family_member(id),
    PRIMARY KEY (event_id, member_id)
);

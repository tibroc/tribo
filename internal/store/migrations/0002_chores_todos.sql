-- Milestone 3: chores, chore instances, todos, and work schedules.

CREATE TABLE chore (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    description        TEXT,
    recurrence_rule    TEXT NOT NULL CHECK (recurrence_rule IN ('daily', 'weekly', 'monthly')),
    assignment_mode    TEXT NOT NULL CHECK (assignment_mode IN ('fixed', 'rotation')),
    assigned_member_id TEXT REFERENCES family_member(id),     -- if fixed
    rotation_member_ids TEXT,                                  -- CSV of member ids, if rotation
    color              TEXT,
    icon               TEXT,
    sort_order         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE chore_instance (
    id                 TEXT PRIMARY KEY,
    chore_id           TEXT NOT NULL REFERENCES chore(id) ON DELETE CASCADE,
    period_start       TEXT NOT NULL,                          -- 'YYYY-MM-DD'
    period_end         TEXT NOT NULL,                          -- exclusive
    assigned_member_id TEXT REFERENCES family_member(id),
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'done', 'skipped')),
    completed_by       TEXT REFERENCES family_member(id),
    completed_at       TEXT,
    UNIQUE (chore_id, period_start)
);

CREATE INDEX idx_chore_instance_period ON chore_instance(period_start);

CREATE TABLE todo (
    id                 TEXT PRIMARY KEY,
    title              TEXT NOT NULL,
    description        TEXT,
    assigned_member_id TEXT REFERENCES family_member(id),      -- null = family-wide
    due_date           TEXT,                                   -- 'YYYY-MM-DD'
    status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    completed_at       TEXT,
    sort_order         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE work_schedule (
    id              TEXT PRIMARY KEY,
    member_id       TEXT NOT NULL REFERENCES family_member(id),
    days_of_week    TEXT NOT NULL,                             -- 7 chars Mon..Sun, e.g. '1111100'
    start_time      TEXT NOT NULL,                             -- 'HH:MM'
    end_time        TEXT NOT NULL,
    label           TEXT NOT NULL DEFAULT 'Work',
    show_on_calendar INTEGER NOT NULL DEFAULT 0
);

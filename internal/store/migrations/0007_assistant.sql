-- AI assistant briefs: cached output of the scheduled LLM generation. One row
-- per (kind, period_start); regeneration replaces the row. content_json holds
-- the structured brief (priorities / watchOut / praise) as returned+validated.
CREATE TABLE IF NOT EXISTS assistant_brief (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('day', 'week')),
    period_start TEXT NOT NULL, -- YYYY-MM-DD (day: the date; week: the Monday)
    content_json TEXT NOT NULL,
    model        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (kind, period_start)
);

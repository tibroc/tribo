-- Focus & priorities (docs/focus-plan.md, phase F1): a lightweight priority
-- model on to-dos and chores, plus the guilt-free "not now" defer log that
-- feeds the focus queue (and, later, Review).

ALTER TABLE todo ADD COLUMN importance INTEGER NOT NULL DEFAULT 0; -- 0 normal, 1 important
ALTER TABLE todo ADD COLUMN effort TEXT NOT NULL DEFAULT 'standard'
    CHECK (effort IN ('2min', '5min', 'standard', 'heavy'));
-- A to-do can be anchored to an event ("before Soccer pickup"); ranked by the
-- event's start. No FK: events live in the disposable CalDAV cache.
ALTER TABLE todo ADD COLUMN anchor_event_id TEXT;

ALTER TABLE chore ADD COLUMN effort TEXT NOT NULL DEFAULT 'standard'
    CHECK (effort IN ('2min', '5min', 'standard', 'heavy'));

-- "Not now": hides the item from the focus queue for the rest of the day,
-- family-wide (predictable — the same queue on every device), and logs who
-- deferred for the weekly review.
CREATE TABLE IF NOT EXISTS focus_defer (
    id          TEXT PRIMARY KEY,
    item_kind   TEXT NOT NULL CHECK (item_kind IN ('todo', 'chore', 'event')),
    item_id     TEXT NOT NULL,
    member_id   TEXT,
    deferred_on TEXT NOT NULL, -- YYYY-MM-DD (family wall clock)
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_focus_defer_day ON focus_defer (deferred_on, item_kind, item_id);

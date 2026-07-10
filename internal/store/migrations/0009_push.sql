-- Web Push (docs/focus-plan.md, phase F3): self-hosted VAPID notifications —
-- morning brief and leaving-time transition warnings, per member, opt-in.

-- Generic app settings (first use: auto-generated VAPID keys when the
-- VAPID_* env vars are unset).
CREATE TABLE IF NOT EXISTS app_setting (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- One row per (member, browser/device) push subscription.
CREATE TABLE IF NOT EXISTS push_subscription (
    id         TEXT PRIMARY KEY,
    member_id  TEXT NOT NULL REFERENCES family_member(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Per-member notification preferences. lang is the device language captured
-- when prefs are saved, so server-side notification text matches the app.
CREATE TABLE IF NOT EXISTS notification_pref (
    member_id     TEXT PRIMARY KEY REFERENCES family_member(id) ON DELETE CASCADE,
    morning_brief INTEGER NOT NULL DEFAULT 1,
    brief_hour    INTEGER NOT NULL DEFAULT 7,  -- family-timezone hour, 0..23
    transitions   INTEGER NOT NULL DEFAULT 1,  -- 15-min leaving warnings
    second_nudge  INTEGER NOT NULL DEFAULT 0,  -- extra 5-min warning
    quiet_start   TEXT NOT NULL DEFAULT '21:00',
    quiet_end     TEXT NOT NULL DEFAULT '07:00',
    lang          TEXT NOT NULL DEFAULT 'en'
);

-- Dedupe log: one row per delivered notification key, so restarts never
-- double-send (key e.g. 'brief:2026-07-10:mem-x' or 'transition:evt:mem-x:15').
CREATE TABLE IF NOT EXISTS push_sent (
    key     TEXT PRIMARY KEY,
    sent_at TEXT NOT NULL
);

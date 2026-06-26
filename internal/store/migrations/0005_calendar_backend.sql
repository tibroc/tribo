-- Radicale-backed calendars. Classify each source by kind, bind person/Google
-- calendars to a family member, and mark auto-provisioned ("managed") calendars
-- that the UI must not let users add/remove. Existing rows default to 'external'.
ALTER TABLE calendar_source ADD COLUMN kind TEXT NOT NULL DEFAULT 'external'
    CHECK (kind IN ('person', 'family', 'birthdays', 'chores', 'external'));
ALTER TABLE calendar_source ADD COLUMN member_id TEXT REFERENCES family_member(id);
ALTER TABLE calendar_source ADD COLUMN managed INTEGER NOT NULL DEFAULT 0;

-- Drives the auto-generated Birthdays calendar.
ALTER TABLE family_member ADD COLUMN date_of_birth TEXT; -- 'YYYY-MM-DD', nullable

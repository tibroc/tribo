-- Weekday-specific recurrence for weekly chores. A 7-char Mon..Sun bitstring
-- (same convention as work_schedule.days_of_week), e.g. '0000001' = Sundays,
-- '1010100' = Mon/Wed/Fri. Empty/NULL = no weekday filter (one instance per
-- week bucket, the prior behavior). Only honored when recurrence_rule='weekly'.
ALTER TABLE chore ADD COLUMN recurrence_weekdays TEXT;

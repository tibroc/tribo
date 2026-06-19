-- Flexible chore recurrence: a multiplier on the existing daily/weekly/monthly
-- unit. interval 1 = today's behavior; 2 = "every 2 weeks", 12 = yearly, etc.
-- (Years are represented in the UI as monthly × 12.)
ALTER TABLE chore ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1
    CHECK (recurrence_interval >= 1);

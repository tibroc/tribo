-- Per-family weather location + unit preference, surfaced by the header widget.
-- Single-family instance, so these live on the family row.
ALTER TABLE family ADD COLUMN weather_latitude      REAL;
ALTER TABLE family ADD COLUMN weather_longitude     REAL;
ALTER TABLE family ADD COLUMN weather_location_name TEXT;
ALTER TABLE family ADD COLUMN weather_units         TEXT NOT NULL DEFAULT 'celsius';

-- Seed the existing family with the placeholder location so the widget lights
-- up immediately; users can change it in Family → Settings → Location.
UPDATE family
   SET weather_latitude = 38.7223,
       weather_longitude = -9.1393,
       weather_location_name = 'Lisbon, Portugal'
 WHERE weather_latitude IS NULL;

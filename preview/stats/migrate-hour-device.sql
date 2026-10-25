-- One-time change (2026-10-25): add hour and device to section_views. Earlier rows keep their counts with
-- hour -1 and device "unknown". Run once per database:
--   npx wrangler d1 execute <database> --remote --file stats/migrate-hour-device.sql
CREATE TABLE section_views_new (
  day TEXT NOT NULL, hour INTEGER NOT NULL, page TEXT NOT NULL, section TEXT NOT NULL, source TEXT NOT NULL,
  ask INTEGER NOT NULL, device TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, page, section, source, ask, device)
);
INSERT INTO section_views_new (day, hour, page, section, source, ask, device, n)
  SELECT day, -1, page, section, source, ask, 'unknown', n FROM section_views;
DROP TABLE section_views;
ALTER TABLE section_views_new RENAME TO section_views;

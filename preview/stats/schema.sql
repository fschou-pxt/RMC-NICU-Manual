-- Anonymous section-view counts for the NICU Manual (Cloudflare D1 "nicu-manual-stats"; the public site
-- uses the same table in "nicu-manual-public-stats").
-- One row per day x hour x page x section x how the reader got there x whether Ask was on x kind of device.
-- No person, device ID, IP address or question text is stored. Days and hours are Pacific time.
CREATE TABLE IF NOT EXISTS section_views (
  day     TEXT    NOT NULL,          -- YYYY-MM-DD (America/Los_Angeles)
  hour    INTEGER NOT NULL,          -- 0-23 (America/Los_Angeles); -1 = recorded before hours were kept
  page    TEXT    NOT NULL,          -- e.g. respiratory
  section TEXT    NOT NULL,          -- heading id, e.g. sec-th-protocol ("_top" = above the first section)
  source  TEXT    NOT NULL,          -- how they got there: see functions/api/views.js
  ask     INTEGER NOT NULL,          -- 1 if the Ask feature was on for this site build, else 0
  device  TEXT    NOT NULL,          -- phone, tablet, computer, or unknown (from screen size and touch)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, hour, page, section, source, ask, device)
);

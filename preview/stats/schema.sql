-- Anonymous section-view counts for the NICU Manual (Cloudflare D1 "nicu-manual-stats").
-- One row per day x page x section x how the reader got there x whether Ask was on. No person, device,
-- IP address or question text is stored. Days are Pacific time.
CREATE TABLE IF NOT EXISTS section_views (
  day     TEXT    NOT NULL,          -- YYYY-MM-DD (America/Los_Angeles)
  page    TEXT    NOT NULL,          -- e.g. respiratory
  section TEXT    NOT NULL,          -- heading id, e.g. sec-th-protocol ("_top" = above the first section)
  source  TEXT    NOT NULL,          -- how they got there: see functions/api/views.js
  ask     INTEGER NOT NULL,          -- 1 if the Ask feature was on for this site build, else 0
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page, section, source, ask)
);

-- Append-only: one row per save; the last row per reviewer and item counts.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewer_slug TEXT NOT NULL,
  item_id TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_reviewer ON scores (reviewer_slug, id);

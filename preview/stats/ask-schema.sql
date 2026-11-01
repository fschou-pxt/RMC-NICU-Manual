-- Ask study tables (Cloudflare D1, the preview's "nicu-manual-stats"). Run once per database:
--   npx wrangler d1 execute <database> --remote --file stats/ask-schema.sql
-- No person, device ID or IP address is stored (neo_rate keeps only keyed hashes, for 2 minutes). Days and hours are Pacific time.

-- One row per answer Ask showed (functions/api/ask-log.js), for the blinded answer review.
CREATE TABLE IF NOT EXISTS ask_answers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT, -- order the answers were recorded
  day            TEXT    NOT NULL,  -- YYYY-MM-DD
  hour           INTEGER NOT NULL,  -- 0-23
  conversation   TEXT    NOT NULL,  -- random ID, new for each chat
  turn           INTEGER NOT NULL,  -- question number within the chat (1 = first)
  kind           TEXT    NOT NULL,  -- manual (from the manual, with In[Neo]Sight when the manual had no answer), inneosight (asked for beside a manual answer), web (AI summary of a web search) or general_ai
  question       TEXT    NOT NULL,  -- as sent to the AI, patient details already replaced by [date], [ID] ...
  phi_removed    TEXT    NOT NULL DEFAULT '', -- what was replaced, e.g. "a date, a phone number"; empty if nothing
  rephrased      TEXT    NOT NULL DEFAULT '', -- the AI's restatement when the first search found nothing
  answer         TEXT    NOT NULL DEFAULT '', -- the answer shown (markdown); empty when there was an error
  not_in_manual  INTEGER NOT NULL DEFAULT 0,  -- 1 if Ask said the manual does not address it
  sources        TEXT,              -- JSON [{title, url, quote}]: the manual sections cited
  inneosight     TEXT,              -- JSON {text, articles: [{title, url, reviewed}]} or NULL
  error          TEXT,              -- the error shown instead of an answer, or NULL
  model          TEXT    NOT NULL DEFAULT '', -- model version reported by the provider
  manual_version TEXT    NOT NULL DEFAULT '', -- fingerprint of the manual text Ask searched (changes with every edit)
  seconds        REAL                -- time from question to answer
);

-- Calls to the study's Grok key per day (functions/api/ask.js), for the daily cap.
CREATE TABLE IF NOT EXISTS ask_usage (
  day   TEXT    PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);

-- In[Neo]Sight searches per minute (functions/api/neo.js): 5 per browser, 30 per IP address. "who" is "b:" or "a:" and a
-- keyed hash of the browser's random ID or of the IP address, not either itself; rows older than the previous minute are deleted.
CREATE TABLE IF NOT EXISTS neo_rate (
  who    TEXT    NOT NULL,
  minute INTEGER NOT NULL,  -- minutes since 1970 (UTC)
  calls  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (who, minute)
);

# Nightly evidence checks (run on the Mac Mini)

A scheduled task runs this file each night: it takes the next **4** sections from `evidence/queue.json` and
runs the three-agent check in `evidence/PIPELINE.md` on each. You are the orchestrator in PIPELINE.md.

Project root: `/Users/fschou/Documents/Claude/Projects/RMC-NICU-Handbook` (it syncs between Macs through
iCloud). Agent instructions: `evidence/agents/researcher.md`, `comparer.md`, `reviewer.md`.

## Hard limits

- Write only inside `evidence/`: the workspaces in `evidence/_work/`, the published `evidence/<chapter>/<slug>.json`,
  `evidence/queue.json`, and `evidence/_work/nightly-log.md`. Never edit the manual, the site, or anything else.
- **No git commands that write** (no add, commit, checkout, pull, push, stash) and no deploys. Two Macs share this
  folder through iCloud; the MacBook commits and publishes the results. Read-only `git log`/`git rev-parse` is fine.
- Never delete files.

## Redo under the section-scope rule

Every section is being checked again, in queue order. Start each section from a new workspace. Its old workspace is in
`evidence/_work/_old-rule-2026-11-05/workspaces/<chapter>/<slug>/`: copy its `sources/` folder into the new workspace, then search afresh. Use nothing
else from that folder. An approved section replaces its old `evidence/<chapter>/<slug>.json`; the old copy is already in
`evidence/_work/_old-rule-2026-11-05/published/`. A note with no `scope` block is an old-rule note.

## Before starting

1. If `evidence/_work/nightly.lock` exists and is less than 10 hours old, another run is going: stop and report that.
   Otherwise write the lock (the current time) and remove it when you finish, whatever happens.
2. Any item left `running` by an earlier run that stopped: set it back to `pending` (keep its workspace; the agents
   reuse what is there).

## For each of the next 4 `pending` items, in order of `n`

1. Set `status` to `running` and `started` to now (ISO time) in `queue.json`, and save it.
2. **Locate the text.** Open the item's `file` and find its heading again (the `section` title; the line range in the
   queue may have shifted after edits). The item covers that heading down to the next heading of the same or higher
   level; for split items (`section` with " › "), only the listed subheadings.
3. **Write `brief.md`** in `evidence/_work/<chapter>/<slug>/`, following `evidence/_work/_old-rule-2026-11-05/workspaces/respiratory/lisa/brief.md`:
   chapter, section, file and current line range, anchor (from the queue), manual commit (`git -C <root> log -1
   --format=%h -- <file>`), unit context ("Kaiser Permanente Riverside and Moreno Valley NICUs, California"; add the population from the chapter title and the section's headings, without widening it for a line's broad wording), anything not checkable (images, videos, links), then the section text with line
   numbers in a fenced block, exactly as in the file.
4. **Researcher:** start a subagent with the full text of `agents/researcher.md` and the workspace path. If its triage
   finds **no clinical claims**, set `status` to `no_clinical`, record the triage counts in `result`, and go to the
   next item (no Comparer or Reviewer).
5. **Comparer:** a new subagent with `agents/comparer.md` and the workspace path.
6. **Reviewer:** a new subagent with `agents/reviewer.md`, the workspace path and the round number. On REVISE, send the
   RESEARCHER-FIX items to a new Researcher subagent and the COMPARER-FIX items to a new Comparer subagent (each with
   its agent file, the workspace and the items), then review again. At most 2 revision rounds (3 reviews), plus one text-only round (a 4th review) if no verdict is in dispute.
7. **APPROVED:** write `evidence/<chapter>/<slug>.json` from `comparison.json` as PIPELINE.md's schema says: set
   `source.file` to the item's `file` (the .mdx), `source.lines`, `source.manual_commit`; `references` from
   `refs.json`; `review` = {"verdict": "APPROVED", "rounds": N, "date": today, "quotes_checked": X,
   "references_verified": Y}. Use `evidence/_work/_old-rule-2026-11-05/published/respiratory/lisa.json` as the model, and keep the `scope` block. Set `status` to `approved`.
8. **Not approved after the last review:** set `status` to `needs_review` and put the open mandatory items in `result`.
   Publish nothing for it.
9. Any failure you cannot fix (a tool keeps failing, the heading is gone): `status` `error`, the reason in `result`.
10. Set `finished` and a one-line `result` (counts by verdict, rounds), and save `queue.json` after every item.

If you reach a usage limit, stop cleanly: leave the current item `running` (the next run resets it), remove the lock,
and report.

## At the end

Append to `evidence/_work/nightly-log.md`: the date, each item (chapter / section, status, verdict counts, rounds,
time taken), and how many items remain `pending`. Your final message is that same summary.

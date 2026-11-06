# Morning publish of the night's evidence checks (run on the MacBook)

A scheduled task on the MacBook runs this file each morning. The Mac Mini runs `evidence/NIGHTLY.md` overnight
and writes its results into this folder through iCloud; this run commits them and puts the new notes on the sites.

Project root: `/Users/fschou/Documents/Claude/Projects/RMC-NICU-Handbook` (git branch `astro`).

## Rules

- Commit only files inside `evidence/` (`git add evidence/`; `evidence/_work/` is git-ignored). Never stage anything
  else, even if other files are modified: those are the editor's work in progress.
- Never push, and never print the git remote URL (it holds a token).
- Never edit the manual, the site code, or the evidence files themselves. If something is wrong, report it.
- Publish nothing if any step below fails; say which step and why.

## Steps

1. **Is the night's run finished?** If `evidence/_work/nightly.lock` exists and is less than 10 hours old, or any
   item in `evidence/queue.json` is `running`, the Mini is still working: report that and stop.
2. **What's new?** `git status --short evidence/` lists the changes. New or changed `evidence/<chapter>/*.json` files
   are newly approved notes. Read the last entry of `evidence/_work/nightly-log.md` for the night's summary.
   During the redo, a note with no `scope` block is an old-rule note, not new: do not count, check or report it.
   - Nothing changed in `evidence/`: report "nothing new" (with the queue's counts by status) and stop.
   - Only `queue.json` or the instruction files changed (no new notes): commit them (step 4) and stop; no deploy.
3. **Check each new note** before anything is published: it parses as JSON, `review.verdict` is `APPROVED`, its
   `anchor` (`<page>.html#<id>`) names an existing page in `site/src/content/docs/`, and every claim has a verdict.
   A note that fails is left out: report it, and do not stage that file.
4. **Commit**: `git add evidence/` (minus any note that failed step 3), then commit with the message
   `Evidence checks <date>: <chapters and sections>` (one line per approved section) and the attribution lines
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
5. **Build both sites** from `site/`: `npm run build` (preview) and `npm run build:public` (public site). Either build
   failing: stop, publish nothing.
6. **Check the built pages**: for each new note, the built page (`site/dist/<page>.html` and
   `site/dist-public.nosync/<page>.html`) contains an evidence box (`class="evidence`) and the anchor's id. Missing:
   stop, publish nothing.
7. **Deploy**:
   - preview, from `preview/`: `npx -y wrangler@4 pages deploy ../site/dist --project-name nicu-manual-preview --branch main --commit-dirty=true`
   - public, from `public-site/`: `npx -y wrangler@4 pages deploy ../site/dist-public.nosync --project-name nicu-manual --branch main --commit-dirty=true`
   - scoring app, from the project root: `node tools/evidence-scoring/server.mjs --build-cloud`, then from
     `tools/evidence-scoring/cloud/`: `npx -y wrangler@4 pages deploy --project-name nicu-evidence-scoring --branch main --commit-dirty=true`
   Then confirm `https://nicu-manual.pages.dev/<page>/` returns 200 and contains the new evidence box.
8. **Report**: the sections published (chapter › section, verdict counts), the scoring app's new item count, anything left out and why, and the queue's
   progress (approved / no_clinical / needs_review / error / pending).

**Every report, including the ones that stop early** ("still running", "nothing new", a failed step), ends with the
Let's discuss counts: run `python3 evidence/discuss_counts.py` and paste its table as printed. It reads both sites'
count stores (read-only) and shows the change since the last earlier day it ran.

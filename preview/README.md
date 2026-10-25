# Stakeholder preview (password-protected)

The new site is shown privately at https://nicu-manual-preview.pages.dev (Cloudflare Pages project
`nicu-manual-preview`, account Ribo.neo.stat@gmail.com). `functions/_middleware.js` asks for a sign-in on
every request: user name `nicu`, password = the `PREVIEW_PASSWORD` secret. With no secret, everyone is refused.

Set or change the password (prompts for it; it is never stored in this repository):

    npx wrangler pages secret put PREVIEW_PASSWORD --project-name nicu-manual-preview

Publish a fresh build of the new site (run from this folder, after `npm run build` in `site/`):

    npx wrangler pages deploy ../site/dist --project-name nicu-manual-preview --branch main --commit-dirty=true

`wrangler.toml` holds the project settings: the build folder and the `DISCUSS` Workers KV store (free tier)
that keeps the evidence notes' "Let's discuss" counts (`functions/api/discuss.js`). Only a section id and a
number are stored, e.g. `discuss:respiratory-lisa` = 3.

A changed password takes effect on the next publish. The live public manual (GitHub Pages, branch `main`)
is unaffected.

## Section-view counts (anonymous)

Chapter pages report a section once per visit after it has been on screen for 5 seconds, with how the reader
got there (home, sidebar, toc, search, link, ask, ask-panel, browse, direct) and whether Ask was on in that
build. `functions/api/views.js` adds 1 to a daily count in the free D1 database `nicu-manual-stats`
(table in `stats/schema.sql`). No person, device, IP address or question text is stored, and nothing can be
read from the web. Read the counts with wrangler, from this folder:

    npx wrangler d1 execute nicu-manual-stats --remote --command "SELECT day, SUM(n) AS views, COUNT(DISTINCT page||'#'||section) AS sections FROM section_views GROUP BY day ORDER BY day"
    npx wrangler d1 execute nicu-manual-stats --remote --command "SELECT source, SUM(n) FROM section_views GROUP BY source"
    npx wrangler d1 execute nicu-manual-stats --remote --command "SELECT page, section, SUM(n) AS views FROM section_views GROUP BY page, section ORDER BY views DESC LIMIT 25"

Breadth of use (the question for Ask): sections used per week, the share of views going to the top 10
sections, and views outside the top 50, compared between the baseline (Ask off) and Ask on.

## Ask on/off (launch plan)

Build with `ASK=off npm run build` (in `site/`) to launch without Ask: no Ask in the sidebar, home page, tab bar
or chat bubble, and the Ask page says "coming soon". About 3 months later, or once the baseline is enough,
build without `ASK=off` to turn Ask on. Every count records which phase it came from (`ask` = 0 or 1).

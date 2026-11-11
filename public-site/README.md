# Public site (https://nicu-manual.pages.dev)

The new NICU Manual for colleagues: built with Ask off, no password. It stays out of search engines for now
(`NOINDEX` in `functions/_middleware.js`). The "new version" notice (SOFT_LAUNCH=1) was removed on 2026-11-04, once the
old manual began redirecting here. The password-protected preview (`../preview`, Ask on) stays for stakeholders and
for testing Ask.

Build and publish (the build goes to `site/dist-public.nosync`, separate from the preview's):

    cd ../site && npm run build:public
    cd ../public-site && npx wrangler pages deploy ../site/dist-public.nosync --project-name nicu-manual --branch main --commit-dirty=true

Counts are separate from the preview's: section views in D1 `nicu-manual-public-stats` (same queries as in
`../preview/README.md`, with this database name) and "Let's discuss" in KV `DISCUSS_PUBLIC`.

The daily report is a cloud routine that emails the editor. It reads `/api/report` (fixed read-only queries, `functions/api/report.js`)
with the secret `REPORT_KEY`, kept as a Pages secret and in the routine's cloud environment.

At the official launch: set `NOINDEX = false`. Turn Ask on about 3 months later by building without `ASK=off`.

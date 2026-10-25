# Public site (https://nicu-manual.pages.dev)

The new NICU Manual for colleagues: built with Ask off, no password. During the soft launch it shows a
"new version" notice on every page (SOFT_LAUNCH=1) and stays out of search engines (`NOINDEX` in
`functions/_middleware.js`). The password-protected preview (`../preview`, Ask on) stays for stakeholders and
for testing Ask.

Build and publish (the build goes to `site/dist-public.nosync`, separate from the preview's):

    cd ../site && npm run build:public
    cd ../public-site && npx wrangler pages deploy ../site/dist-public.nosync --project-name nicu-manual --branch main --commit-dirty=true

Counts are separate from the preview's: section views in D1 `nicu-manual-public-stats` (same queries as in
`../preview/README.md`, with this database name) and "Let's discuss" in KV `DISCUSS_PUBLIC`.

At the official launch: build without SOFT_LAUNCH (drop it from `build:public`), set `NOINDEX = false`, and
point the old manual's pages to this site. Turn Ask on about 3 months later by building without `ASK=off`.

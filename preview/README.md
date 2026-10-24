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

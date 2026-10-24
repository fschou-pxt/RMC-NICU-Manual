# Stakeholder preview (password-protected)

The revamp is shown privately at https://nicu-manual-preview.pages.dev (Cloudflare Pages project
`nicu-manual-preview`, account Ribo.neo.stat@gmail.com). `functions/_middleware.js` asks for a sign-in on
every request: user name `nicu`, password = the `PREVIEW_PASSWORD` secret. With no secret, everyone is refused.

Set or change the password (prompts for it; it is never stored in this repository):

    npx wrangler pages secret put PREVIEW_PASSWORD --project-name nicu-manual-preview

Publish a fresh build of the revamp (run from this folder, after `quarto render` and
`python3 chatbot/build_knowledge.py` in the project root):

    npx wrangler pages deploy ../_book --project-name nicu-manual-preview --branch main

A changed password takes effect on the next publish. The live public manual (GitHub Pages, branch `main`)
is unaffected.

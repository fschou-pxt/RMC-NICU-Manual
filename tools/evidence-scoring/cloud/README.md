# Hosted evidence scoring

The scoring app on Cloudflare Pages, for reviewers on other computers. Project `nicu-evidence-scoring`, scores in the D1 database `evidence-scores`.

It leaves out the retrieved full texts: licensed papers are never published, even behind a passcode. Reviewers read the PubMed abstract in the app and open the DOI in a new tab.

The item list is frozen at each deploy, so new or re-run evidence checks appear only after the next deploy. Scores carry an `item_hash`, and the app asks for a re-score if an item's text changed.

Everything is refused until the passcode secret is set, and a new secret takes effect at the next deploy. Set it yourself; it never goes in a file:

    cd tools/evidence-scoring/cloud && npx -y wrangler@4 pages secret put SCORING_PASSCODE --project-name nicu-evidence-scoring

Deploy (from the repository root, after `cd site && npm run build`):

    node tools/evidence-scoring/server.mjs --build-cloud
    cd tools/evidence-scoring/cloud && npx -y wrangler@4 pages deploy --project-name nicu-evidence-scoring --branch main --commit-dirty=true

All reviewers' scores, for analysis and backup (do this only when both reviewers are done, or keep the file from them):

    node tools/evidence-scoring/server.mjs --export-cloud

Writes `research/evidence-scores/cloud-all-reviewers.csv` and `cloud-log-backup.jsonl`.

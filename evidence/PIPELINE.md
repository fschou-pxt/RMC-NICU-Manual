# Manual Evidence Check: standard

Compares the KP Riverside NICU Manual's clinical statements with current published evidence. Modeled on
In[Neo]Sight's three-agent pipeline (Researcher → Writer → Reviewer), with a **Comparer** in place of the
Writer. The manual's text is never edited: results live in `evidence/<chapter>/<section>.json` and are
shown beside the manual as labeled, AI-generated evidence notes.

## Roles (strictly separated)

| Agent | Reads | Writes | Never |
|---|---|---|---|
| 1 Researcher | the section's `brief.md`; the literature | `triage.json`, `refs.json`, `sources/`, `evidence_sheet.md` | judges concordance |
| 2 Comparer | `brief.md`, `triage.json`, `evidence_sheet.md`, `refs.json`, sources | `comparison.json` (draft output) | searches for new evidence, edits refs |
| 3 Reviewer | everything above | `reviews/round_<N>.md` | edits any file but its own |

The orchestrator (the main session) creates the workspace, runs the agents in order, routes Reviewer
items back (Researcher for evidence/ref problems, Comparer for wording/verdict problems; at most 2
revision rounds), and on APPROVED writes the published file `evidence/<chapter>/<section>.json`.

## Paths

- Workspace (git-ignored, holds retrieved full texts): `evidence/_work/<chapter>/<section>/`
- Published result (committed): `evidence/<chapter>/<section>.json`
- Tools (In[Neo]Sight's, reused as is): `TOOLS = /Users/fschou/Documents/Claude/Projects/Intuitive Neonatology/Intuitive Neonatology_Editorial/tools`
  - `refs.py build|verify|show|abstracts`: references built only from PubMed/CrossRef records
  - `fetch_fulltext.py`: open-access full text (PMC → Europe PMC → Unpaywall), with an attempt log

## Step 0: triage (Researcher)

Every sentence or list item of the section is classified, so non-medical text is excluded systematically
and auditably:

- `clinical`: a checkable clinical claim (indication, threshold, dose, timing, device setting, technique,
  monitoring, choice of therapy). **Only these are checked.**
- `operational`: local logistics (who to call, order-set names, workflow, staffing, documentation, equipment
  location, phone numbers).
- `definition`: a local definition or label with no clinical recommendation.
- `context`: background prose with no recommendation.

A list's lead-in ("Either of the following:") is kept with its items: a claim's text quotes the lead-in and
the items together so any/all logic is preserved.

## Evidence hierarchy (Researcher)

Search in this order and stop descending when a level answers the claim well:

1. Current guidelines and consensus statements (AAP, European Consensus Guidelines on RDS, CPS, NRP/ILCOR, ESPGHAN, WHO), most recent version.
2. Cochrane and other systematic reviews / meta-analyses.
3. Randomized trials, then large observational studies.
4. For technique details with no trial evidence: published procedural descriptions or expert consensus, labeled as such.

Prefer evidence from the last 10 years; older landmark sources are fine when still current. Each claim's
evidence must come from a retrieved document (full text when open access, otherwise the PubMed abstract)
and be quoted verbatim with its location. A search snippet is a lead, never evidence.

## Verdicts (Comparer)

| Verdict | Meaning |
|---|---|
| `concordant` | Current evidence supports the manual's statement as written. |
| `partly_concordant` | Supported in direction, but evidence differs on a threshold, population, or detail, or is narrower/broader. |
| `discordant` | Current evidence recommends otherwise. |
| `insufficient` | No adequate evidence either way (local practice choice). |
| `practice_varies` | Guidelines or trials legitimately differ; the manual follows one accepted option. |

`partly_concordant` and `discordant` get an **evidence note**: 1–3 plain sentences starting "Current
evidence suggests…", each claim in it cited. Every verdict gets a one-sentence `summary` with citations.
Notes describe evidence; they never instruct ("consider", not "do") and never restate the manual.

## Output schema (`comparison.json` → published `<section>.json`)

```json
{
  "chapter": "respiratory",
  "section": "Least Invasive Surfactant Administration",
  "anchor": "respiratory.html#least-invasive-surfactant-administration",
  "source": { "file": "respiratory.qmd", "lines": "7-36", "manual_commit": "<git sha>" },
  "checked": "YYYY-MM-DD",
  "generated_with": "<model names of the three agents>",
  "triage": { "clinical": 0, "operational": 0, "definition": 0, "context": 0 },
  "claims": [
    {
      "id": "c1",
      "manual_text": "exact text from the manual",
      "verdict": "concordant | partly_concordant | discordant | insufficient | practice_varies",
      "summary": "One sentence on what the evidence shows [Key2023].",
      "note": "Current evidence suggests … [Key2023]. (only for partly_concordant / discordant)",
      "evidence": [ { "ref": "Key2023", "quote": "verbatim", "location": "Recommendation 4.2 / Abstract / Table 2" } ]
    }
  ],
  "references": [ "<entries from refs.json, as refs.py writes them>" ],
  "review": { "verdict": "APPROVED", "rounds": 1, "date": "YYYY-MM-DD" }
}
```

## Display (in the manual and the app)

- Under the section: "Evidence check (AI-generated, independently AI-reviewed, checked <Mon YYYY>)":
  counts by verdict and a list of references for concordant claims.
- For each `partly_concordant` / `discordant` claim: an amber box with the note, its citations, and a
  **Let's discuss** button (raised hand) that emails the protocol leads with the manual text, the note,
  and the references.

## Schedule

Each chapter is re-checked monthly (or when the manual section changes). A re-check reruns all three
agents; changes in verdicts are dated in the JSON.

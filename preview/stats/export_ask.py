"""Export the Ask study records (D1 table ask_answers, see ask-schema.sql) for the answer review.

Writes research/ask-log/ask-answers-<date>.json (one object per answer, sources and In[Neo]Sight parsed) and a .csv
with the same rows, in the project's git-ignored research/ folder: the records hold real questions, so they never
go into git. Run from anywhere:

    python3 -I preview/stats/export_ask.py                  # the preview's records
    python3 -I preview/stats/export_ask.py --since 2027-02-01
    python3 -I preview/stats/export_ask.py --local          # the local test database (wrangler pages dev)
"""
import argparse, csv, datetime, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = os.path.dirname(HERE)
OUT_DIR = os.path.join(os.path.dirname(PREVIEW), "research", "ask-log")
DB = "nicu-manual-stats"
COLUMNS = ["id", "day", "hour", "conversation", "turn", "kind", "question", "phi_removed", "rephrased", "answer",
           "not_in_manual", "sources", "inneosight", "error", "model", "manual_version", "seconds"]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", help="first day to include (YYYY-MM-DD, Pacific)")
    ap.add_argument("--local", action="store_true", help="read the local test database instead of the preview's")
    a = ap.parse_args()
    if a.since and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a.since):
        sys.exit("--since must be YYYY-MM-DD")
    sql = "SELECT * FROM ask_answers" + (f" WHERE day >= '{a.since}'" if a.since else "") + " ORDER BY id"
    cmd = ["npx", "-y", "wrangler@4", "d1", "execute", DB, "--local" if a.local else "--remote", "--json", "--command", sql]
    run = subprocess.run(cmd, cwd=PREVIEW, capture_output=True, text=True)
    if run.returncode:
        sys.exit("wrangler failed:\n" + (run.stderr or run.stdout)[-2000:])
    rows = json.loads(run.stdout)[0]["results"]
    for r in rows:
        for k in ("sources", "inneosight"):
            r[k] = json.loads(r[k]) if r.get(k) else ([] if k == "sources" else None)
    os.makedirs(OUT_DIR, exist_ok=True)
    stem = os.path.join(OUT_DIR, f"ask-answers-{datetime.date.today():%Y-%m-%d}" + ("-local" if a.local else ""))
    with open(stem + ".json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    with open(stem + ".csv", "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({**r, "sources": json.dumps(r["sources"], ensure_ascii=False),
                        "inneosight": json.dumps(r["inneosight"], ensure_ascii=False) if r["inneosight"] else ""})
    convs = len({r["conversation"] for r in rows})
    print(f"{len(rows)} answers in {convs} conversations -> {stem}.json and .csv")


if __name__ == "__main__":
    main()

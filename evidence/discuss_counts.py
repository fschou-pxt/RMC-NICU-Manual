#!/usr/bin/env python3
"""Let's discuss counts for the morning report: one row per tapped item (✋ on a line of an evidence box), both sites.

Reads both sites' Workers KV stores with wrangler (no site password needed), compares with the last earlier day
saved in evidence/_work/discuss-counts.json, saves today's numbers there, and prints a Markdown table.
Read-only on the sites. Run from anywhere: python3 evidence/discuss_counts.py
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE = os.path.join(ROOT, "evidence")
SNAP = os.path.join(EVIDENCE, "_work", "discuss-counts.json")
DOCS = os.path.join(ROOT, "site", "src", "content", "docs")
# the DISCUSS namespaces in public-site/wrangler.toml and preview/wrangler.toml
STORES = {"public": "ee1a797b8493497eb716de22048343c8", "preview": "00ddf1ac51dd4411ab20a896db14a366"}


def notes():
    """Tappable items of approved notes as {"<note id>/<item>": "Chapter › Section: <label> <manual text>"}.
    The note id is the key the site stores counts under; items are claims with a note, then related points."""
    out = {}
    for d in sorted(os.listdir(EVIDENCE)):
        p = os.path.join(EVIDENCE, d)
        if not os.path.isdir(p) or d.startswith("_") or d == "agents":
            continue
        for f in sorted(x for x in os.listdir(p) if x.endswith(".json")):
            ev = json.load(open(os.path.join(p, f)))
            if (ev.get("review") or {}).get("verdict") != "APPROVED":
                continue
            page = ev["anchor"].split("#")[0].replace(".html", "")
            title = page
            try:
                m = re.search(r'^title:\s*"?(.*?)"?\s*$', open(os.path.join(DOCS, page + ".mdx")).read(), re.M)
                title = m.group(1) if m else page
            except OSError:
                pass
            where = f"{title} › {ev['section'].split(' › ')[0]}"
            for c in ev["claims"]:
                if c.get("note"):
                    out[f"{d}-{f[:-5]}/{c['id']}"] = f"{where}: {c['verdict'].replace('_', ' ')}: {short(c['manual_text'])}"
            for o in ev.get("omissions") or []:
                out[f"{d}-{f[:-5]}/{o['id']}"] = f"{where}: related point: {short(o.get('topic', ''))}"
    return out


def short(t, n=90):
    t = re.sub(r"\s+", " ", t.replace("&ge;", "≥").replace("&le;", "≤").replace("|", "/")).strip()
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def wrangler(*args):
    r = subprocess.run(["npx", "-y", "wrangler@4", "kv", "key", *args, "--remote"], cwd=ROOT,
                       capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError(r.stderr.strip().splitlines()[-1] if r.stderr.strip() else "wrangler failed")
    return r.stdout


def counts(namespace):
    """{"<note id>/<item>": n} from every key the store holds ("discuss:<note id>" -> {"c4": 2, ...})."""
    out = wrangler("list", "--namespace-id", namespace, "--prefix", "discuss:")
    keys = [k["name"] for k in json.loads(out[out.index("["):])]
    res = {}
    for k in keys:
        v = wrangler("get", k, "--namespace-id", namespace, "--text").strip().splitlines()
        try:
            items = json.loads(v[-1]) if v else {}
        except ValueError:
            continue
        if isinstance(items, dict):  # an old one-per-section number is skipped
            for item, n in items.items():
                res[f"{k.split(':', 1)[1]}/{item}"] = int(n)
    return res


def main():
    today = datetime.date.today().isoformat()
    names = notes()
    now, errors = {}, []
    for site, ns in STORES.items():
        try:
            now[site] = counts(ns)
        except Exception as e:  # report and go on with the other site
            errors.append(f"{site}: {e}")
    try:
        snaps = json.load(open(SNAP))
    except (OSError, ValueError):
        snaps = {}
    earlier = sorted(d for d in snaps if d < today)
    before = snaps[earlier[-1]] if earlier else {}
    snaps[today] = {**snaps.get(today, {}), **now}
    os.makedirs(os.path.dirname(SNAP), exist_ok=True)
    json.dump({d: snaps[d] for d in sorted(snaps)[-60:]}, open(SNAP, "w"), indent=1)

    def cell(site, i):
        if site not in now:
            return "n/a"
        n = now[site].get(i, 0)
        d = n - before.get(site, {}).get(i, 0) if before else 0
        return f"{n} ({d:+d})" if d else str(n)

    since = f"change since {earlier[-1]}" if earlier else "first count, no earlier day to compare"
    print(f"**Let's discuss counts** ({today}; {since})\n")
    rows = sorted(names, key=lambda i: (-sum(now.get(s, {}).get(i, 0) for s in STORES), names[i]))
    tapped = [i for i in rows if any(now.get(s, {}).get(i, 0) or before.get(s, {}).get(i, 0) for s in STORES)]
    if tapped:
        print("| Item | Public | Preview |\n|---|---|---|")
        for i in tapped:
            print(f"| {names[i]} | {cell('public', i)} | {cell('preview', i)} |")
    else:
        print("No taps yet.")
    totals = ", ".join(f"{s} {sum(now[s].get(i, 0) for i in names)}" for s in STORES if s in now)
    sections = {i.split("/")[0] for i in names}
    quiet = sections - {i.split("/")[0] for i in tapped}
    print(f"\nTotal taps: {totals or 'n/a'}. Sections with no taps: {len(quiet)} of {len(sections)}.")
    for e in errors:
        print(f"\nCould not read the {e}")
    return 1 if len(errors) == len(STORES) else 0


if __name__ == "__main__":
    sys.exit(main())

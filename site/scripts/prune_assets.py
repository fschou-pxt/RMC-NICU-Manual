"""After the build: keep only the images and downloads the site actually uses (as Quarto did).

    python3 scripts/prune_assets.py

public/Figures and public/files are links to the project's whole folders, so the build copies everything;
this removes from dist/ any file in Figures/ or files/ that no page, script or the knowledge file names,
and any file over 25 MB (Cloudflare Pages' per-file limit), listing what it removed.
"""
import os
import re
import urllib.parse

# SITE_DIST picks the build folder (the public build uses its own, see package.json "build:public")
DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.environ.get("SITE_DIST", "dist"))
LIMIT = 25 * 1024 * 1024


def main():
    text = []
    for dirpath, _, files in os.walk(DIST):
        for f in files:
            if f.endswith((".html", ".js", ".css", ".md", ".json", ".webmanifest")):
                text.append(open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read())
    text = "\n".join(text)
    # a file name may appear as written, URL-encoded, or with only its spaces encoded ("a%20(b).pdf")
    used = lambda name: any(v in text for v in (name, urllib.parse.quote(name), urllib.parse.quote(name, safe="()"), name.replace(" ", "%20")))
    removed, too_big, kept = [], [], 0
    for top in ("Figures", "files"):
        for dirpath, _, files in os.walk(os.path.join(DIST, top)):
            for f in files:
                p = os.path.join(dirpath, f)
                rel = os.path.relpath(p, DIST)
                if os.path.getsize(p) > LIMIT:
                    too_big.append((rel, os.path.getsize(p), used(f)))
                    os.remove(p)
                elif not used(f):
                    removed.append(rel)
                    os.remove(p)
                else:
                    kept += 1
    # copies a file-sync service left behind ("respiratory 2.html"): never publish them
    # (a copy only when the same name without the number sits beside it: "NEC 2023.pptx" alone is a real file)
    copy_of = lambda d, f: (m := re.match(r"^(.*) \d+(\.[\w.]+)?$", f)) and os.path.exists(os.path.join(d, m.group(1) + (m.group(2) or "")))
    dupes = [os.path.join(d, f) for d, _, fs in os.walk(DIST) for f in fs if copy_of(d, f)]
    for p in dupes:
        os.remove(p)
    print(f"assets: kept {kept}, removed {len(removed)} unused" + (f", {len(dupes)} duplicate copies" if dupes else ""))
    for rel, size, is_used in too_big:
        print(f"  over 25 MB, not published: {rel} ({size / 1e6:.0f} MB){'  <- linked from a page' if is_used else ''}")


if __name__ == "__main__":
    main()

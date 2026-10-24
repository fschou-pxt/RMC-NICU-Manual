"""After the build: keep only the images and downloads the site actually uses (as Quarto did).

    python3 scripts/prune_assets.py

public/Figures and public/files are links to the project's whole folders, so the build copies everything;
this removes from dist/ any file in Figures/ or files/ that no page, script or the knowledge file names,
and any file over 25 MB (Cloudflare Pages' per-file limit), listing what it removed.
"""
import os
import re
import urllib.parse

DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
LIMIT = 25 * 1024 * 1024


def main():
    text = []
    for dirpath, _, files in os.walk(DIST):
        for f in files:
            if f.endswith((".html", ".js", ".css", ".md", ".json", ".webmanifest")):
                text.append(open(os.path.join(dirpath, f), encoding="utf-8", errors="ignore").read())
    text = "\n".join(text)
    used = lambda name: name in text or urllib.parse.quote(name) in text
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
    print(f"assets: kept {kept}, removed {len(removed)} unused")
    for rel, size, is_used in too_big:
        print(f"  over 25 MB, not published: {rel} ({size / 1e6:.0f} MB){'  <- linked from a page' if is_used else ''}")


if __name__ == "__main__":
    main()

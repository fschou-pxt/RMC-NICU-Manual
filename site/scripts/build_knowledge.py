"""Knowledge export and offline file list for the Astro site (the site version of chatbot/build_knowledge.py).

Run after `npx astro build` in site/:

    python3 scripts/build_knowledge.py

Reads dist/*.html in book order (src/chapters.json) and writes:
- dist/chatbot/nicu-manual-knowledge.md, which the chat bubble and the app load, and a copy at
  site/nicu-manual-knowledge.md (for a Claude Project). Same format as before: one block per section,
  "## Chapter › Section › …" then "URL: …" on the live site. Chapters keep their numbers ("10 Respiratory",
  "Appendix B — Dot Phrases"); sections have none, like the site.
- dist/sw.js, the offline service worker for the installable app.
"""

import html as html_lib
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import date, datetime

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(SITE)
DIST = os.path.join(SITE, os.environ.get("SITE_DIST", "dist"))  # the public build uses its own folder
sys.path.insert(0, os.path.join(ROOT, "chatbot"))
import build_knowledge as quarto  # noqa: E402  shared helpers (tables, sections, links)

BASE_URL = quarto.BASE_URL
OUT = os.path.join(SITE, "nicu-manual-knowledge.md")

# Starlight marks sections with plain headings, not section containers: split at each heading with an id.
# Formulas come back from MathML as $TeX$; the visible copy of a formula, heading link icons,
# screen-reader-only text and AI-generated evidence notes are left out.
LUA = quarto.LUA.replace("function Div(el)", r"""
function Header(el)
  if el.level >= 2 and el.level <= MAX and el.identifier ~= '' then
    return {pandoc.RawBlock('markdown', '@@SEC|' .. el.identifier .. '|' .. el.level .. '@@'), el}
  end
end
function Link(el)
  if el.classes:includes('sl-anchor-link') then return {} end
end
function Span_site(el)
  if el.classes:includes('katex-html') or el.classes:includes('sr-only') then return {} end
end
function Div(el)
  if el.classes:includes('evidence') then return {} end""".replace("MAX", str(quarto.MAX_LEVEL)), 1)
LUA = LUA.replace("function Span(el)\n", "function Span(el)\n  local r = Span_site(el); if r then return r end\n", 1)


def book():
    return json.load(open(os.path.join(SITE, "src", "chapters.json")))


def chapter_label(ch, title):
    n = str(ch["number"])
    return f"Appendix {n} — {title}" if re.fullmatch(r"[A-Z]", n) else f"{n} {title}"


def main_content(html):
    m = re.search(r'<div class="sl-markdown-content">', html)
    # the content ends where Starlight's footer (previous/next links, chat bubble) begins
    end = html.find("<footer", m.end()) if m else -1
    body = html[m.end():end if end > 0 else html.rfind("</main>")] if m else ""
    body = re.sub(r"<iframe\b.*?</iframe>", "<p>[Embedded video or app: see the live page]</p>", body, flags=re.S | re.I)
    body = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", "", body, flags=re.S | re.I)
    return body


def page_title(html):
    m = re.search(r'<h1 id="_top"[^>]*>(.*?)</h1>', html, re.S)
    return html_lib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1)))).strip() if m else ""


def link_fix(md, page):
    # the site links chapters without ".html" (respiratory#sec-x); the knowledge file keeps the .html URLs
    md = re.sub(r"\]\(/?([A-Za-z][\w-]*)(#[^)\s]*)?\)", lambda m: f"]({m.group(1)}.html{m.group(2) or ''})", md)
    return quarto.link_fix(md, page)


def home_sections():
    """The home page's What's new and About, in the old wording ("NEW UPDATE - Oct 23, 2026"), which the app reads."""
    src = open(os.path.join(SITE, "src", "content", "docs", "index.mdx"), encoding="utf-8").read()
    lines = []
    for m in re.finditer(r'<Update date="(\d{4})-(\d{2})-(\d{2})">(.*?)</Update>', src, re.S):
        d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        lines.append(f"NEW UPDATE - {d:%b} {d.day}, {d.year}\n")
        for item in m.group(4).strip().splitlines():
            lines.append(re.sub(r"@sec-([\w-]+)", lambda r: f"[{r.group(0)}]({sec_url(r.group(1))})", item))
        lines.append("")
    about = re.search(r"## About this manual\n(.*?)\n<p class=\"credit\">", src, re.S)
    title = "KP Riverside Neonatal ICU Manual"
    out = [f"## {title} › Home\nURL: {BASE_URL}index.html\n\nWhat's new\n\n" + "\n".join(lines).strip() + "\n"]
    if about:
        out.append(f"## {title} › Home › About this manual\nURL: {BASE_URL}index.html#about-this-manual\n\n{about.group(1).strip()}\n")
    return title, out


_ids = None


def sec_url(sec_id):
    """URL of a section id, for @sec- links written on the home page."""
    global _ids
    if _ids is None:
        _ids = {}
        for ch in book():
            p = os.path.join(DIST, ch["slug"] + ".html")
            if os.path.exists(p):
                for i in re.findall(r'\bid="(sec-[\w-]+)"', open(p, encoding="utf-8").read()):
                    _ids.setdefault(i, ch["slug"])
    page = _ids.get(sec_id)
    return f"{BASE_URL}{page}.html#{sec_id}" if page else f"{BASE_URL}index.html"


def write_service_worker():
    """dist/sw.js from pwa/sw.template.js: the pages, styles and scripts the installed app keeps offline."""
    keep = []
    for dirpath, _, files in os.walk(DIST):
        rel_dir = os.path.relpath(dirpath, DIST)
        for f in files:
            if re.search(r" \d+(\.[\w.]+)?$", f) or f.endswith(".map"):
                continue
            rel = f if rel_dir == "." else os.path.join(rel_dir, f).replace(os.sep, "/")
            top = rel.split("/")[0]
            if rel_dir == "." and f.endswith((".html", ".webmanifest")):
                keep.append(rel)
            elif top in ("_astro", "site_libs", "pwa", "chatbot", "tools"):
                keep.append(rel)
    keep = sorted(set(keep) - {"sw.js", "404.html"})
    size = sum(os.path.getsize(os.path.join(DIST, p)) for p in keep)
    now = datetime.now()
    sw = open(os.path.join(ROOT, "pwa", "sw.template.js"), encoding="utf-8").read()
    sw = (sw.replace("__VERSION__", now.strftime("%Y%m%d%H%M%S"))
            .replace("__BUILT__", now.strftime("%B %d, %Y").replace(" 0", " "))
            .replace("__PRECACHE__", json.dumps(["./"] + keep, indent=1)))
    open(os.path.join(DIST, "sw.js"), "w", encoding="utf-8").write(sw)
    print(f"sw.js: {len(keep)} files stored for offline use ({size / 1e6:.1f} MB)")


def main():
    chapters = [c for c in book() if c["slug"] != "index"]
    missing = [c["slug"] for c in chapters if not os.path.exists(os.path.join(DIST, c["slug"] + ".html"))]
    if missing:
        raise SystemExit("STOP: chapters missing from dist/ (build incomplete): " + ", ".join(missing))
    pandoc = quarto.find_pandoc()
    lua_path = os.path.join(tempfile.gettempdir(), "nicu_site_sections.lua")
    open(lua_path, "w").write(LUA)
    home_title, home = home_sections()
    parts, n = [f"# {home_title}\nURL: {BASE_URL}index.html\n\n" + "\n".join(home)], len(home)
    for ch in chapters:
        page = ch["slug"] + ".html"
        html = open(os.path.join(DIST, page), encoding="utf-8").read()
        title = chapter_label(ch, page_title(html) or ch["slug"])
        md = link_fix(quarto.html_to_md(pandoc, main_content(html), lua_path), page)
        secs = quarto.sections(md, page, title)
        n += len(secs)
        parts.append(f"# {title}\nURL: {BASE_URL}{page}\n\n" + "\n".join(secs))
    os.remove(lua_path)
    header = (f"# KP Riverside Neonatal ICU Manual — knowledge export\n\n"
              f"Source: {BASE_URL} (exported {date.today():%B %d, %Y}).\n"
              f"Each section starts with a '## breadcrumb' line and its 'URL:' on the live site.\n\n")
    # non-breaking spaces keep "< 80" together on the page; plain spaces are easier to search
    open(OUT, "w", encoding="utf-8").write((header + "\n".join(parts)).replace("\u00a0", " "))
    os.makedirs(os.path.join(DIST, "chatbot"), exist_ok=True)
    shutil.copy(OUT, os.path.join(DIST, "chatbot", os.path.basename(OUT)))
    print(f"{n} sections, {os.path.getsize(OUT):,} bytes -> {OUT} (+ dist copy)")
    write_service_worker()


if __name__ == "__main__":
    main()

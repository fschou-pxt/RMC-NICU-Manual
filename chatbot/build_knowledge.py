"""Build a one-file knowledge export of the rendered NICU Manual for a Claude Project.

Run after `quarto render` (reads _book/*.html in _quarto.yml chapter order):

    python3 chatbot/build_knowledge.py
    quarto publish gh-pages --no-render

Writes chatbot/nicu-manual-knowledge.md: one block per section (down to level 4),
each with its breadcrumb and the live GitHub Pages URL, so answers can link to it.
Also copies it into _book/chatbot/, where the chat widget (chatbot/widget.html) loads it.
"""

import html as html_lib
import os
import re
import shutil
import subprocess
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = os.path.join(ROOT, "_book")
OUT = os.path.join(ROOT, "chatbot", "nicu-manual-knowledge.md")
BASE_URL = "https://fschou-pxt.github.io/RMC-NICU-Manual/"
MAX_LEVEL = 4  # deeper sections are folded into their level-4 parent

# Lua filter: mark each section start, drop images and other wrappers
LUA = r"""
function Image(el) return {} end
function Span(el)
  if el.classes:includes('screen-reader-only') then return {} end
end
-- compact one-line-per-row tables (grid tables pad wide tables into huge text)
local function cell_text(cell)
  local s = pandoc.utils.stringify(cell.contents):gsub('\xC2\xA0', ' '):gsub('[ \t\r\n]+', ' '):gsub('|', '/')
  return s
end
local function row_line(row)
  local cells = {}
  for _, c in ipairs(row.cells) do table.insert(cells, cell_text(c)) end
  return '| ' .. table.concat(cells, ' | ') .. ' |'
end
function Table(tbl)
  local lines = {}
  local function add(rows) for _, r in ipairs(rows) do table.insert(lines, row_line(r)) end end
  add(tbl.head.rows)
  if #lines > 0 then
    local n = #tbl.head.rows[1].cells
    table.insert(lines, '|' .. string.rep(' --- |', n))
  end
  for _, b in ipairs(tbl.bodies) do add(b.head); add(b.body) end
  add(tbl.foot.rows)
  return pandoc.RawBlock('markdown', table.concat(lines, '\n'))
end
function Div(el)
  local lvl
  for _, c in ipairs(el.classes) do
    local m = c:match('^level(%d)$')
    if m then lvl = tonumber(m) end
  end
  if el.classes:includes('quarto-figure') or el.classes:includes('cell-output-display') then
    return el.content
  end
  if lvl and lvl <= MAX and el.identifier ~= '' then
    local blocks = {pandoc.RawBlock('markdown', '@@SEC|' .. el.identifier .. '|' .. lvl .. '@@')}
    for _, b in ipairs(el.content) do table.insert(blocks, b) end
    return blocks
  end
  return el.content
end
""".replace("MAX", str(MAX_LEVEL))

PANDOC_TO = ("markdown-raw_html-native_divs-native_spans-fenced_divs-bracketed_spans"
             "-link_attributes-header_attributes-auto_identifiers-smart-simple_tables"
             "-multiline_tables+pipe_tables+grid_tables")


def find_pandoc():
    for cmd in (["quarto", "pandoc"], ["pandoc"]):
        if shutil.which(cmd[0]):
            return cmd
    rstudio = "/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto"
    if os.path.exists(rstudio):
        return [rstudio, "pandoc"]
    raise SystemExit("pandoc/quarto not found")


def chapter_files():
    yml = open(os.path.join(ROOT, "_quarto.yml"), encoding="utf-8").read()
    return [m.group(1) for m in re.finditer(r"^\s*-\s+(\S+)\.qmd\s*$", yml, re.M)]


def strip_md(s):
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    return re.sub(r"[*_`\\]", "", s).strip()


def html_to_md(pandoc, html, lua_path):
    r = subprocess.run(pandoc + ["-f", "html", "-t", PANDOC_TO, "--wrap=none",
                                 "--lua-filter", lua_path],
                       input=html, capture_output=True, text=True, check=True)
    return r.stdout


def main_content(html):
    # everything after the chapter title block, up to the end of <main>
    start = html.find('<header id="title-block-header"')
    start = html.find("</header>", start) + len("</header>") if start >= 0 else html.find("<main")
    body = html[start:html.rfind("</main>")]
    # pandoc would fetch iframe pages (videos, Shiny apps); keep only a note
    body = re.sub(r"<iframe\b.*?</iframe>", "<p>[Embedded video or app: see the live page]</p>",
                  body, flags=re.S | re.I)
    return body


def chapter_title(html):
    m = re.search(r'<h1 class="title">(.*?)</h1>', html, re.S)
    t = html_lib.unescape(re.sub(r"<[^>]+>", " ", m.group(1))) if m else ""
    return re.sub(r"\s+", " ", t).strip()


def link_fix(md, page):
    # make relative links into the manual absolute
    def fix(m):
        url = m.group(2)
        if re.match(r"^(https?:|mailto:|tel:)", url):
            return m.group(0)
        if url.startswith("#"):
            url = page + url
        return f"[{m.group(1)}]({BASE_URL}{url})"
    return re.sub(r"\[([^\]]*)\]\(([^)\s]+)\)", fix, md)


def sections(md, page, chap_title):
    blocks, stack = [], []
    cur = {"url": BASE_URL + page, "crumb": chap_title, "lines": []}
    for line in md.splitlines():
        m = re.match(r"^@@SEC\|(.+?)\|(\d)@@$", line.strip())
        if m:
            blocks.append(cur)
            sid, lvl = m.group(1), int(m.group(2))
            cur = {"url": f"{BASE_URL}{page}#{sid}", "lvl": lvl, "lines": [], "title": None}
            stack = [s for s in stack if s[0] < lvl]
            continue
        if cur.get("title") is None and "lvl" in cur and re.match(r"^#{1,6} ", line):
            cur["title"] = strip_md(line.lstrip("#"))
            stack.append((cur["lvl"], cur["title"]))
            cur["crumb"] = " › ".join([chap_title] + [t for _, t in stack if t])
            continue
        cur["lines"].append(line)
    blocks.append(cur)
    out = []
    for b in blocks:
        text = "\n".join(l for l in b["lines"] if l.strip() not in ("\\", "* * *", "-" * 72))
        text = text.replace("\\<", "<").replace("\\>", ">")
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            continue
        crumb = b.get("crumb") or chap_title
        out.append(f"## {crumb}\nURL: {b['url']}\n\n{text}\n")
    return out


CRITERIA_HEAD = re.compile(r"indicat|criteri|eligib|inclusion|exclusion|contraindic|risk factor|candidate|qualif", re.I)
QUANTIFIER = re.compile(r"\b(all|any|either|both|one or more|at least|none|each|including)\b|\bor\b|\band\b", re.I)


def warn_unlabeled_lists():
    """Flag criteria lists that don't say whether all or any items must apply (the chatbot can't tell)."""
    found = 0
    for name in chapter_files():
        path = os.path.join(ROOT, name + ".qmd")
        if not os.path.exists(path) or name.startswith(("genetics-lluch", "lluch-formulary")):
            continue
        lines = open(path, encoding="utf-8").read().splitlines()
        for i, line in enumerate(lines):
            m = re.match(r"^#{2,6}\s+(.*)$", line)
            if not m or not CRITERIA_HEAD.search(re.sub(r"\(.*?\)", "", m.group(1))):
                continue
            intro, items, bullets = [], [], 0
            for nxt in lines[i + 1:]:
                if re.match(r"^#{1,6}\s", nxt):
                    break
                if re.match(r"^([*-]|\d+\.)\s+", nxt):
                    bullets += 1
                    items.append(nxt)
                elif nxt.strip() and not bullets:
                    intro.append(nxt)
                elif nxt.strip() and bullets and not nxt.startswith((" ", "\t")):
                    break
            # labeled in the intro, or the items themselves spell out the logic (e.g. "meet both ...")
            labeled = any(QUANTIFIER.search(t) for t in intro) or \
                any(re.search(r"\b(both|either|all|any)\b", t, re.I) for t in items)
            if bullets >= 2 and not labeled:
                found += 1
                print(f"  check: {name}.qmd:{i + 1} '{m.group(1).strip()}' lists {bullets} items "
                      "without saying 'Any of' or 'All of'")
    if found:
        print(f"{found} criteria list(s) may be read ambiguously by the chatbot (see above).")


def main():
    warn_unlabeled_lists()
    pandoc = find_pandoc()
    lua_path = os.path.join(os.path.dirname(OUT), ".sections.lua")
    with open(lua_path, "w") as f:
        f.write(LUA)
    parts, n = [], 0
    for name in chapter_files():
        page = name + ".html"
        path = os.path.join(BOOK, page)
        if not os.path.exists(path):
            print("skip (not rendered):", page)
            continue
        html = open(path, encoding="utf-8").read()
        title = chapter_title(html) or name
        md = link_fix(html_to_md(pandoc, main_content(html), lua_path), page)
        secs = sections(md, page, title)
        n += len(secs)
        parts.append(f"# {title}\nURL: {BASE_URL}{page}\n\n" + "\n".join(secs))
    os.remove(lua_path)
    header = (f"# KP Riverside Neonatal ICU Manual — knowledge export\n\n"
              f"Source: {BASE_URL} (exported {date.today():%B %d, %Y}).\n"
              f"Each section starts with a '## breadcrumb' line and its 'URL:' on the live site.\n\n")
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(parts))
    # the chat widget fetches this copy from the published site
    os.makedirs(os.path.join(BOOK, "chatbot"), exist_ok=True)
    shutil.copy(OUT, os.path.join(BOOK, "chatbot", os.path.basename(OUT)))
    print(f"{n} sections, {os.path.getsize(OUT):,} bytes -> {OUT} (+ _book copy)")


if __name__ == "__main__":
    main()

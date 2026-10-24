"""One-time conversion of the Quarto chapters (.qmd) into MDX pages for the Astro site.

    python3 site/scripts/qmd2mdx.py [chapter.qmd ...]     (default: every chapter in _quarto.yml)

Writes site/src/content/docs/<name>.mdx (same file names, so page URLs stay <name>.html) and
site/src/chapters.json (book order and parts, used for the sidebar).
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.path.join(ROOT, "site")
QUARTO = "/Applications/RStudio.app/Contents/Resources/app/quarto/bin/quarto"
FILTER = os.path.join(SITE, "scripts", "qmd2mdx.lua")
OUT = os.path.join(SITE, "src", "content", "docs")


def book_chapters():
    """[(part, file)] in book order, from _quarto.yml."""
    yml = open(os.path.join(ROOT, "_quarto.yml"), encoding="utf-8").read().split("chapters:", 1)[1]
    out, part = [], None
    for line in yml.splitlines():
        m = re.match(r"\s+- part:\s*\"?([^\"]+)\"?\s*$", line)
        if m:
            part = m.group(1).strip()
            continue
        m = re.match(r"\s+-\s+(\S+\.qmd)\s*$", line)
        if m:
            out.append((part, m.group(1)))
        elif line.strip() and not line.startswith(" "):
            break  # end of the book: block
    return out


def convert(qmd):
    src = open(os.path.join(ROOT, qmd), encoding="utf-8").read()
    src = re.sub(r"\A---\n.*?\n---\n", "", src, flags=re.S)  # Quarto front matter
    src = re.sub(r"^(\s*`{3,})\{(mermaid|r)\}", r"\1\2", src, flags=re.M)  # Quarto's ```{mermaid} -> ```mermaid
    md = subprocess.run(
        [QUARTO, "pandoc", "-f", "markdown-markdown_in_html_blocks-auto_identifiers+tex_math_dollars",
         "-t", "gfm+tex_math_dollars+pipe_tables", "--wrap=none", "-L", FILTER],
        input=src, capture_output=True, text=True, check=True).stdout
    # the chapter's first-level heading becomes the page title
    m = re.search(r"^# (.+?)(?: \{/\*#([\w-]+)\*/\})?\s*$", md, re.M)
    title = m.group(1).strip() if m else os.path.splitext(qmd)[0]
    chapter_id = m.group(2) if m else None
    if m:
        md = md[:m.start()] + md[m.end():]
    md = re.sub(r"^(?:<br />\s*)+$", "", md, flags=re.M)  # spacer lines: the site handles spacing
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    front = ["---", f"title: {json.dumps(title)}"]
    if chapter_id:
        front.append(f"chapterId: {json.dumps(chapter_id)}")
    front += [f"source: {json.dumps(qmd)}", "---", ""]
    return "\n".join(front) + md, title


def main():
    chapters = book_chapters()
    wanted = sys.argv[1:] or [f for _, f in chapters]
    os.makedirs(OUT, exist_ok=True)
    order = []
    for n, (part, qmd) in enumerate(chapters):
        name = os.path.splitext(qmd)[0]
        if qmd in wanted:
            mdx, title = convert(qmd)
            open(os.path.join(OUT, name + ".mdx"), "w", encoding="utf-8").write(mdx)
            print(f"{qmd} -> site/src/content/docs/{name}.mdx  ({title})")
        order.append({"slug": name, "part": part, "number": n})
    json.dump(order, open(os.path.join(SITE, "src", "chapters.json"), "w"), indent=1)


if __name__ == "__main__":
    main()

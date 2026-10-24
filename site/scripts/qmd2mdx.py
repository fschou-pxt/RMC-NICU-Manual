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
        if re.match(r"\s+appendices:\s*$", line):
            part = "Appendices"
            continue
        m = re.match(r"\s+-\s+(\S+\.qmd)\s*$", line)
        if m:
            out.append((part, m.group(1)))
        elif line.strip() and not line.startswith(" "):
            break  # end of the book: block
    return out


def r_chunk_output(m):
    """The result of one R chunk, as Quarto rendered it: an image with caption, or a CSV table with caption."""
    head, code = m.group(1), m.group(2)
    cap = re.search(r'fig\.cap\s*=\s*"([^"]*)"', head)
    img = re.search(r'include_graphics\("([^"]+)"\)', code)
    if img:
        return f'\n![{cap.group(1) if cap else ""}]({img.group(1)})\n\n'  # alone in its paragraph: a captioned figure
    csv = re.search(r'"/([^"]+\.csv)"', code)
    if csv:
        import csv as csvmod, html
        rows = list(csvmod.reader(open(os.path.join(ROOT, csv.group(1)), encoding="utf-8-sig")))
        tcap = re.search(r'caption\s*=\s*"([^"]*)"', code)
        # a Markdown link written in a CSV cell ([Finnegan Score](#nas)) becomes a link
        link = lambda v: re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2">\1</a>', html.escape(v, quote=False))
        cell = lambda tag, v: f"<{tag}>{link(v)}</{tag}>"
        out = ["<table>"]
        if tcap:
            out.append(f"<caption>{tcap.group(1)}</caption>")
        out.append("<thead><tr>" + "".join(cell("th", v) for v in rows[0]) + "</tr></thead><tbody>")
        out += ["<tr>" + "".join(cell("td", v) for v in r) + "</tr>" for r in rows[1:]]
        out.append("</tbody></table>")
        return "\n".join(out) + "\n"
    raise SystemExit("R chunk with no known output:\n" + head + code)


def convert(qmd):
    src = open(os.path.join(ROOT, qmd), encoding="utf-8").read()
    src = re.sub(r"\A---\n.*?\n---\n", "", src, flags=re.S)  # Quarto front matter
    src = re.sub(r"^(\s*`{3,})\{mermaid\}", r"\1mermaid", src, flags=re.M)  # Quarto's ```{mermaid} -> ```mermaid
    src = re.sub(r"^```\{r([^}]*)\}\n(.*?)^```[ \t]*$", r_chunk_output, src, flags=re.M | re.S)  # R chunks -> their output
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
    # inside HTML tables, a cell's content must stay on its own line for MDX: join continuation lines
    md = re.sub(r"<table>.*?</table>", lambda t: re.sub(
        r"\n(?!\s*(?:<(?:tr|td|th|thead|tbody|tfoot|caption|colgroup|col)\b|</(?:tr|thead|tbody|tfoot|colgroup|table)\b))",
        " ", t.group(0)), md, flags=re.S)
    # keep "< 80" and "≥ 30%" together on one line (outside code blocks): a non-breaking space
    parts = re.split(r"(^```.*?^```)", md, flags=re.M | re.S)
    md = "".join(p if p.startswith("```") else re.sub(r"(&lt;|&gt;|[≤≥]) (?=[\d.])", r"\1&nbsp;", p) for p in parts)
    md = re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"
    front = ["---", f"title: {json.dumps(title)}"]
    if chapter_id:
        front.append(f"chapterId: {json.dumps(chapter_id)}")
    # keep the original file name as the page address (Starlight would lower-case VLBW, DR, dotPhrases)
    front += [f"slug: {json.dumps(os.path.splitext(qmd)[0])}", f"source: {json.dumps(qmd)}", "---", ""]
    return "\n".join(front) + md, title


def main():
    chapters = book_chapters()
    wanted = sys.argv[1:] or [f for _, f in chapters]
    os.makedirs(OUT, exist_ok=True)
    order = []
    for n, (part, qmd) in enumerate(chapters):
        name = os.path.splitext(qmd)[0]
        if qmd in wanted and qmd != "index.qmd":  # the home page is built by hand (src/content/docs/index.mdx)
            mdx, title = convert(qmd)
            open(os.path.join(OUT, name + ".mdx"), "w", encoding="utf-8").write(mdx)
            print(f"{qmd} -> site/src/content/docs/{name}.mdx  ({title})")
        # chapters are numbered 1, 2, … after the home page; appendices are lettered A, B, …
        appendix = sum(1 for p, _ in chapters[:n] if p == "Appendices") if part == "Appendices" else None
        number = chr(65 + appendix) if appendix is not None else n - sum(1 for p, _ in chapters[:n] if p == "Appendices")
        order.append({"slug": name, "part": part, "number": number})
    json.dump(order, open(os.path.join(SITE, "src", "chapters.json"), "w"), indent=1)


if __name__ == "__main__":
    main()

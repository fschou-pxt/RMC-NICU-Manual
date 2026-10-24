"""Word-for-word check: the new site must show the same text as the Quarto manual, chapter by chapter.

    python3 site/scripts/textcheck.py <quarto _book folder> <astro dist folder> [chapter ...]

Compares the visible words of each chapter (page title + body). Ignored, because they are not content:
Quarto's chapter/section numbers, heading link icons, navigation, the "last updated" line, and
spacing/quote-style differences. Math is compared separately, by its TeX source.
Exit code 1 if any chapter differs.
"""
import difflib
import json
import html
import os
import re
import sys
import unicodedata
from html.parser import HTMLParser

VOID = {"br", "img", "hr", "col", "source", "input", "meta", "link", "area", "base", "embed", "param", "track", "wbr"}
BLOCK = {"p", "li", "td", "th", "tr", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "thead", "tbody",
         "figure", "figcaption", "caption", "blockquote", "pre", "section", "aside", "header", "dt", "dd", "details", "summary"}
XREF = "\u27e8xref\u27e9"


class Extract(HTMLParser):
    """Collects text inside `roots`, skipping elements that match `skip`; math TeX goes to `math`;
    elements matching `xref` count as one cross-reference token (their label may differ between sites)."""

    def __init__(self, roots, skip, math, xref):
        super().__init__(convert_charrefs=True)
        self.roots, self.skip, self.math_rule, self.xref = roots, skip, math, xref
        self.stack = []  # dicts: tag, root, skip, math
        self.parts, self.math = [], []

    @staticmethod
    def _match(rules, tag, attrs):
        cls = set((attrs.get("class") or "").split())
        for r in rules:
            t, _, rest = r.partition(".")
            t, _, rid = t.partition("#")
            if (t and t != tag) or (rid and attrs.get("id") != rid) or (rest and not set(rest.split(".")) <= cls):
                continue
            return True
        return False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        top = self.stack[-1] if self.stack else {"root": False, "skip": False, "math": None}
        root = top["root"] or self._match(self.roots, tag, attrs)
        skip = top["skip"]
        if root and not skip and self._match(self.xref, tag, attrs):
            self.parts.append(f" {XREF} ")
            skip = True
        skip = skip or (root and self._match(self.skip, tag, attrs))
        math = top["math"]
        if root and math is None and self._match(self.math_rule, tag, attrs):
            math = []
        if root and not skip and tag in BLOCK | {"br"}:
            self.parts.append(" ")
        if tag in VOID:
            return
        self.stack.append({"tag": tag, "root": root, "skip": skip, "math": math, "opens_math": math is not None and top["math"] is None})

    def handle_endtag(self, tag):
        if not any(e["tag"] == tag for e in self.stack):
            return  # stray closing tag: ignore rather than lose our place
        while self.stack:
            e = self.stack.pop()
            if e["opens_math"]:
                self.math.append(norm_tex("".join(e["math"])))
            if e["root"] and not e["skip"] and e["tag"] in BLOCK:
                self.parts.append(" ")
            if e["tag"] == tag:
                break

    def handle_data(self, data):
        if not self.stack:
            return
        e = self.stack[-1]
        if e["math"] is not None:
            e["math"].append(data)  # math is compared by its source, never as words
        elif e["root"] and not e["skip"]:
            self.parts.append(data)


def norm_text(s):
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"').replace("\u2026", "...")
    s = re.sub(r"(\w)\^(\w+)\^", r"\1\2", s)  # 2^nd^ shown raw by Quarto in some tables = 2nd
    s = re.sub(r"\bFigure \d+(\.\d+)*:\s*", "", s)  # Quarto's figure numbers
    s = re.sub(r"\bAppendix [A-Z] \u2014\s*", "", s)  # Quarto's appendix labels
    return s.split()


def norm_tex(s):
    s = s.strip()
    s = re.sub(r"^\\[\(\[]|\\[\)\]]$", "", s).strip()
    s = re.sub(r"^\\begin\{equation\*?\}|\\end\{equation\*?\}$", "", s.strip())  # Quarto keeps the wrapper
    return re.sub(r"\s+", "", s)


QUARTO = dict(
    roots=["main#quarto-document-content"],
    skip=["span.chapter-number", "span.header-section-number", "a.anchorjs-link", "div.quarto-title-meta",
          "script", "style", "nav", "div.quarto-title-meta-heading", "span.screen-reader-only"],
    math=["span.math"],
    xref=["a.quarto-xref"],
)
ASTRO = dict(
    roots=["div.sl-markdown-content", "header.chapter-hero"],
    skip=["a.sl-anchor-link", "script", "style", "nav.jump", "p.eyebrow", "span.katex-html", "span.katex-mathml"],
    math=["annotation"],
    xref=["a.xref"],
)


def page(path, rules):
    p = Extract(rules["roots"], rules["skip"], rules["math"], rules["xref"])
    p.feed(open(path, encoding="utf-8").read())
    return norm_text("".join(p.parts)), p.math


def known_exceptions(name):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textcheck-known.json")
    known = json.load(open(path)) if os.path.exists(path) else {}
    return [(norm_text(k["quarto"]), norm_text(k["site"]), k["reason"]) for k in known.get(name, [])]


def classify(qa, aa, ops, known):
    """Split differences into moved text (same words deleted in one place, inserted in another),
    accepted known exceptions, and real differences."""
    deleted = [" ".join(qa[i1:i2]) for t, i1, i2, j1, j2 in ops if t == "delete"]
    inserted = [" ".join(aa[j1:j2]) for t, i1, i2, j1, j2 in ops if t == "insert"]
    moved = set(deleted) & set(inserted)
    real, accepted = [], []
    q_known = " ".join(" ".join(k[0]) for k in known)
    a_known = " ".join(" ".join(k[1]) for k in known)
    for op in ops:
        t, i1, i2, j1, j2 = op
        q, a = " ".join(qa[i1:i2]), " ".join(aa[j1:j2])
        if (t == "delete" and q in moved) or (t == "insert" and a in moved):
            continue
        if (not q or q in q_known) and (not a or a in a_known):
            accepted.append(op)
            continue
        real.append(op)
    return real, accepted, moved


def main():
    book, dist = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or sorted(f[:-5] for f in os.listdir(dist) if f.endswith(".html") and f not in ("404.html", "index.html"))
    bad = 0
    for name in names:
        qa, qm = page(os.path.join(book, name + ".html"), QUARTO)
        aa, am = page(os.path.join(dist, name + ".html"), ASTRO)
        ops = [op for op in difflib.SequenceMatcher(None, qa, aa, autojunk=False).get_opcodes() if op[0] != "equal"]
        known = known_exceptions(name)
        diffs, accepted, moved = classify(qa, aa, ops, known)
        mathdiff = sorted(set(qm) ^ set(am))
        status = "OK" if not diffs and not mathdiff else "DIFF"
        notes = (f"  ({len(moved)} moved" if moved else "  (") + (f", {len(known)} accepted: " + "; ".join(k[2][:60] for k in known) if accepted else "") + ")"
        print(f"{status:4} {name:22} {len(qa):6} words  {len(qm):3} formulas  {len(diffs)} text diffs  {len(mathdiff)} formula diffs" + (notes if moved or accepted else ""))
        if status == "DIFF":
            bad += 1
            for tag, i1, i2, j1, j2 in diffs[:12]:
                ctx = " ".join(qa[max(0, i1 - 5):i1])
                print(f"       {tag:7} …{ctx} [{' '.join(qa[i1:i2])[:160]}] → [{' '.join(aa[j1:j2])[:160]}]")
            for m in mathdiff[:6]:
                print(f"       math   {'quarto' if m in qm else 'astro '}: {m[:120]}")
    print(f"\n{len(names) - bad} of {len(names)} chapters identical")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

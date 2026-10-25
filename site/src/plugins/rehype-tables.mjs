// Tables: each one gets the layout that fits what it is for (see LAYOUTS). The cells, their words and their
// order never change; only classes, column labels (data-label, shown by CSS) and grouping are added, so the
// word-for-word check still guards the content. Tables not listed below are lookup tables (the default).
//
//   lookup   find a row by its first column (default): key column emphasized, header and key column stay put
//   long     a long lookup: also a "find" box and a scrolling body (box added in the browser, PageTools)
//   grouped  rows that continue the row above (blank first cell) form one block per drug / problem
//   cards    each row a card: first cell is the title, the others are labeled parts
//   pairs    term → explanation
//   qa       question → answer
//   swap     wrong → right ("Do not use" → "Use these")
//   steps    a numbered sequence
//   compare  the same items across situations (columns): a switch shows one situation (added in PageTools)
//   gallery  items with photos
//   scale    a scored scale (columns from one end of the scale to the other)
//   chart    a reference series, drawn as a chart above the table (values folded below)
//   bycol    criteria grouped by column (e.g. "Not acutely ill" / "Acutely ill"): one box per column listing each
//            row's items, drawn above the table (table folded below, so the word check still reads it)
import path from "node:path";
import { visit } from "unist-util-visit";
import { toString } from "hast-util-to-string";

// page → header patterns of tables whose header row is really the first data row (moved into the body, so layouts
// that hide headers on phones still show it): the Vitamin K table starts with its >1500 g row
const HEADER_IS_DATA = { hemonc: [/^>1500g/] };

// page → [header text pattern, layout]; the pattern is matched against the header cells joined by " | "
const LAYOUTS = {
  admission: [[/^Item \| Weight \| Image/, "gallery"]],
  cardiovascular: [[/^Assessment Criteria \| Sedation/, "scale"]],
  "death-workflows": [[/^Activity or Documentation Required/, "compare"], [/^Scenario \/ Question \| Answer/, "qa"]],
  endocrine: [[/^Indication \| Screening needed/, "pairs"]],
  hemonc: [[/^Age \(days\) \| AFP mean/, "chart"], [/^Category \| Not Acutely Ill \| Acutely Ill/, "bycol"], [/^>1500g/, "pairs"]],
  "infectious-disease": [[/^Antibiotic \| Gestational age/, "grouped"]],
  "lluch-formulary": [[/^DO NOT USE \| USE THESE/, "swap"]],
  neurology: [[/^Step \| Dose \(mg\/kg\)/, "steps"], [/^Table 1\. Neurological Examination/, "cards"]],
  "nutrition-fluid": [[/^Regimen \| Details/, "pairs"], [/^Fortified milk \(mL\)/, "long"]],
  operations: [[/^Step \| Action/, "steps"], [/^Study \| Agreement/, "pairs"]],
  respiratory: [[/^Parameters \| NAVA/, "cards"], [/^Parameter \| Investigate the Reason/, "grouped"],
    [/^Issue \| Possible Causes \| Actions/, "cards"], [/^Intervention \| Monitoring period/, "pairs"]],
  transfer: [[/^Insurance \| Definition/, "cards"]],
};

const text = (n) => toString(n).replace(/\s+/g, " ").trim();
const rowsOf = (sec) => (sec?.children || []).filter((c) => c.tagName === "tr");
const cellsOf = (tr) => tr.children.filter((c) => c.tagName === "td" || c.tagName === "th");
const addClass = (n, ...cls) => { n.properties ||= {}; n.properties.className = [...(n.properties.className || []), ...cls]; };

// Tables written as HTML in a page arrive from MDX as JSX nodes; turn table markup into plain elements first
const TABLE_TAGS = new Set(["table", "caption", "colgroup", "col", "thead", "tbody", "tfoot", "tr", "th", "td"]);
const ATTR = { class: "className", colspan: "colSpan", rowspan: "rowSpan" };
function fromJsx(node) {
  if (!/^mdxJsx(Flow|Text)Element$/.test(node.type) || !TABLE_TAGS.has(node.name)) return false;
  const properties = {};
  for (const a of node.attributes || []) {
    if (a.type !== "mdxJsxAttribute" || (a.value != null && typeof a.value !== "string")) return false; // leave expressions alone
    const name = ATTR[a.name] || a.name;
    properties[name] = name === "className" ? String(a.value || "").split(/\s+/).filter(Boolean) : a.value ?? true;
  }
  Object.assign(node, { type: "element", tagName: node.name, properties });
  delete node.name; delete node.attributes;
  // whitespace between table parts is not content
  if (["table", "thead", "tbody", "tfoot", "tr", "colgroup"].includes(node.tagName))
    node.children = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  node.children.forEach(fromJsx);
  return true;
}

export default function rehypeTables() {
  return (tree, file) => {
    const page = path.basename(file.path || "", ".mdx");
    visit(tree, (n) => /^mdxJsx(Flow|Text)Element$/.test(n.type) && n.name === "table", (n) => { fromJsx(n); });
    visit(tree, "element", (table, index, parent) => {
      if (table.tagName !== "table" || !parent) return;
      const thead = table.children.find((c) => c.tagName === "thead");
      const tbody = table.children.find((c) => c.tagName === "tbody");
      let heads = thead ? cellsOf(rowsOf(thead)[0] || { children: [] }).map(text) : [];
      const sig = heads.join(" | ");
      // a header that is only a title ("Table 1. …" over empty cells, or an empty corner over group names):
      // the first body row holds the real column names; it is marked so layouts can show it as a header
      const first = rowsOf(tbody)[0];
      if (first && (heads.slice(1).every((h) => !h) || !heads[0]) && rowsOf(tbody).length > 2) {
        addClass(first, "subhead");
        if (heads.slice(1).every((h) => !h)) { heads = cellsOf(first).map(text); addClass(table, "title-head"); }
      }
      const layout = (LAYOUTS[page] || []).find(([re]) => re.test(sig))?.[1] || "lookup";
      addClass(table, "tbl", `tbl-${layout}`);
      if (thead && tbody && HEADER_IS_DATA[page]?.some((re) => re.test(sig))) {
        const row = rowsOf(thead)[0];
        for (const c of cellsOf(row)) c.tagName = "td";
        tbody.children.unshift(row);
        table.children = table.children.filter((c) => c !== thead);
        heads = [];
      }

      // column labels for layouts that stack cells (CSS shows them; they are not page text)
      for (const tr of rowsOf(tbody)) if (!tr.properties?.className?.includes("subhead")) cellsOf(tr).forEach((td, i) => {
        if (heads[i]) td.properties = { ...td.properties, dataLabel: heads[i] };
        const t = text(td);
        if (/^(yes|no)(\s*[(,;:.]|$)/i.test(t)) addClass(td, /^yes/i.test(t) ? "v-yes" : "v-no"); // "Yes", "No (…)", not "No activity"
        else if (/^(n\/a|—|-)$/i.test(t)) addClass(td, "v-na");
      });

      // grouped: one <tbody> per block (a row with a first cell starts a block); valid HTML, same order
      if (layout === "grouped" && tbody) {
        const groups = [];
        for (const tr of rowsOf(tbody)) {
          if (text(cellsOf(tr)[0] || {}) || !groups.length) groups.push([]);
          groups[groups.length - 1].push(tr);
        }
        table.children = table.children.flatMap((c) => c === tbody
          ? groups.map((g) => ({ type: "element", tagName: "tbody", properties: { className: ["grp"] }, children: g })) : [c]);
      }
      // cards: a row whose first cell starts with "-" continues the card above ("5. Primitive Reflexes", then
      // "- Suck", "- Moro"), so each numbered item stays in one box: one <tbody> per card
      if (layout === "cards" && tbody && rowsOf(tbody).some((tr) => /^-\s/.test(text(cellsOf(tr)[0] || {})))) {
        const groups = [];
        for (const tr of rowsOf(tbody)) {
          const cont = /^-\s/.test(text(cellsOf(tr)[0] || {}));
          if (cont) addClass(tr, "cont");
          if (!cont || !groups.length) groups.push([]);
          groups[groups.length - 1].push(tr);
        }
        addClass(table, "card-groups");
        table.children = table.children.flatMap((c) => c === tbody
          ? groups.map((g) => ({ type: "element", tagName: "tbody",
              properties: { className: [g.every((tr) => tr.properties?.className?.includes("subhead")) ? "subhead-group" : "card"] }, children: g }))
          : [c]);
      }
      // steps whose first cell is a short label (A, B, …) show it in the step marker
      if (layout === "steps" && rowsOf(tbody).every((tr) => text(cellsOf(tr)[0] || {}).length <= 2)) addClass(table, "steps-label");
      if (layout === "compare") {
        table.properties.dataColumns = heads.slice(1).join("|");
        // the same answer in neighboring situations is shown once, labeled with all of them ("All" view)
        for (const tr of rowsOf(tbody)) {
          const cells = cellsOf(tr);
          for (let i = 1; i < cells.length; i++) {
            let j = i;
            while (j + 1 < cells.length && text(cells[j + 1]) === text(cells[i])) j++;
            if (j > i) {
              cells[i].properties.dataLabelRun = heads.slice(i, j + 1).join(" · ");
              for (let k = i + 1; k <= j; k++) addClass(cells[k], "dup");
            }
            i = j;
          }
        }
      }

      // every table sits in a frame that scrolls sideways on narrow screens
      const frame = { type: "element", tagName: "div", properties: { className: ["tbl-frame", `tbl-frame-${layout}`] }, children: [table] };
      if (layout === "chart") {
        const chart = afpChart(rowsOf(tbody).map((tr) => cellsOf(tr).map(text)));
        frame.children = [
          ...(chart ? [chart] : []),
          { type: "element", tagName: "details", properties: { className: ["tbl-values"] }, children: [
            { type: "element", tagName: "summary", properties: { className: ["tbl-sum"] }, children: [{ type: "text", value: "Show the values" }] }, table] },
        ];
      }
      if (layout === "bycol") {
        frame.children = [
          byColumn(heads, rowsOf(tbody).filter((tr) => !tr.properties?.className?.includes("subhead"))),
          { type: "element", tagName: "details", properties: { className: ["tbl-values"] }, children: [
            { type: "element", tagName: "summary", properties: { className: ["tbl-sum"] }, children: [{ type: "text", value: "Show as a table" }] }, table] },
        ];
      }
      parent.children[index] = frame;
    });
  };
}

// One box per column (after the first): for each row, its first cell as a label and that column's cell as a list
// (lines split at <br>). A copy of the table's own cells, so the words are the manual's.
function byColumn(heads, rows) {
  const el = (tagName, className, children) => ({ type: "element", tagName, properties: className ? { className: [className] } : {}, children });
  const lines = (td) => {
    const out = [[]];
    for (const c of td.children || []) {
      if ((c.type === "element" && c.tagName === "br") || (/^mdxJsx/.test(c.type) && c.name === "br")) out.push([]);
      else out[out.length - 1].push(structuredClone(c));
    }
    return out.filter((l) => l.some((c) => toString(c).trim()));
  };
  return el("figure", "tbl-viz", [el("div", "bycol", heads.slice(1).map((head, i) => el("section", i ? "bycol-card alt" : "bycol-card", [
    el("div", "bycol-title", [{ type: "text", value: head }]),
    ...rows.flatMap((tr) => {
      const cells = cellsOf(tr);
      const items = cells[i + 1] ? lines(cells[i + 1]) : [];
      return items.length ? [el("div", "bycol-label", structuredClone(cells[0].children || [])),
        el("ul", null, items.map((l) => el("li", null, l)))] : [];
    }),
  ])))]);
}

// AFP reference (preterm): mean and 95% interval by age, both axes on log scales (the first week falls fastest).
// Drawn from the table's own numbers; an age range (8-14) is plotted at its midpoint, a lower limit of 0 at the floor.
function afpChart(rows) {
  const num = (s) => Number(String(s).replace(/,/g, ""));
  const pts = rows.map(([d, mean, ci]) => {
    const ages = String(d).split(/\s*[-–]\s*/).map(num);
    const [lo, hi] = String(ci).split(/\s*[-–]\s*/).map(num);
    return { d: ages.reduce((a, b) => a + b, 0) / ages.length, m: num(mean), lo, hi };
  }).filter((p) => [p.d, p.m, p.lo, p.hi].every(Number.isFinite) && p.m > 0 && p.hi > 0);
  if (pts.length < 3) return null;
  const W = 640, H = 300, L = 70, R = 16, T = 16, B = 44;
  const lx = (d) => Math.log10(1 + d), dMax = Math.max(...pts.map((p) => p.d));
  const pos = pts.flatMap((p) => [p.lo, p.m, p.hi]).filter((v) => v > 0);
  const yMin = Math.floor(Math.log10(Math.min(...pos))), yMax = Math.ceil(Math.log10(Math.max(...pos)));
  const x = (d) => L + (lx(d) / lx(dMax)) * (W - L - R);
  const y = (v) => T + (1 - (Math.log10(Math.max(v, 10 ** yMin)) - yMin) / (yMax - yMin)) * (H - T - B);
  const line = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const band = line("hi") + [...pts].reverse().map((p) => `L${x(p.d).toFixed(1)},${y(p.lo).toFixed(1)}`).join("") + "Z";
  const el = (tagName, properties, children = []) => ({ type: "element", tagName, properties, children });
  const txt = (value) => ({ type: "text", value });
  const grid = [];
  for (let e = yMin; e <= yMax; e++) {
    grid.push(el("line", { x1: L, x2: W - R, y1: y(10 ** e), y2: y(10 ** e), className: ["g"] }));
    grid.push(el("text", { x: L - 8, y: y(10 ** e) + 4, textAnchor: "end" }, [txt(Number(10 ** e).toLocaleString("en-US"))]));
  }
  for (const [d, label] of [[0, "0"], [1, "1 d"], [7, "1 wk"], [30, "1 mo"], [91, "3 mo"], [182, "6 mo"], [365, "1 yr"], [730, "2 yr"]])
    if (d <= dMax * 1.05) {
      grid.push(el("line", { x1: x(d), x2: x(d), y1: T, y2: H - B, className: ["g", "gx"] }));
      grid.push(el("text", { x: x(d), y: H - B + 18, textAnchor: "middle" }, [txt(label)]));
    }
  return el("figure", { className: ["tbl-viz"], ariaHidden: "true" }, [
    el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, [
      ...grid,
      el("path", { d: band, className: ["band"] }),
      el("path", { d: line("m"), className: ["mean"] }),
      ...pts.map((p) => el("circle", { cx: x(p.d), cy: y(p.m), r: 2.5, className: ["pt"] })),
      el("text", { x: (L + W - R) / 2, y: H - 6, textAnchor: "middle", className: ["ax"] }, [txt("Age (log scale; ranges at their midpoint)")]),
    ]),
    el("figcaption", {}, [txt("AFP (ng/mL, log scale): mean line, shaded 95% interval. The exact values are in the table below.")]),
  ]);
}

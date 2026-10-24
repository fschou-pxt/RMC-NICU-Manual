// KP Riverside feeding advancement plan, a port of the NICU Feeding Protocol Shiny app
// (neostat.shinyapps.io/nicu_feeding_protocol, feeding_plan.R). Its output is tested
// line for line against that app's build_plan(); change both together.

// Steps from feeding-advancement-table.xlsx: total fluid (mL/kg/day) and base kcal/oz per day
export const PROTOCOLS = {
  protocol1: { tf: [10, 10, 10, 10, 10, 10, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160], kcal: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 26, 26, 26, 26, 26, 26, 28, 28, 28, 28, 28] },
  protocol2: { tf: [10, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160], kcal: [20, 20, 20, 20, 20, 20, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26] },
  protocol3: { tf: [10, 10, 15, 25, 40, 55, 70, 85, 100, 120, 135, 150, 160], kcal: [20, 20, 20, 20, 20, 20, 26, 26, 26, 26, 26, 26, 26] },
  protocol4: { tf: [10, 20, 30, 45, 60, 80, 100, 115, 130, 145, 160], kcal: [20, 20, 20, 20, 26, 26, 26, 26, 26, 26, 26] },
  protocol5: { tf: [16, 25, 40, 55, 70, 90, 120, 140, 160], kcal: [20, 20, 20, 20, 22, 24, 24, 24, 24] },
  protocol6: { tf: [30, 60, 90, 120, 150, 160], kcal: [20, 22, 22, 22, 22, 22] },
  protocol7: { tf: [40, 70, 100, 130, 160], kcal: [20, 22, 22, 22, 22] }
};

export const PROTOCOL_LABELS = {
  protocol1: "< 750 g or \u2264 24 wk \u2014 22 steps",
  protocol2: "750 \u2013 999 g \u2014 17 steps",
  protocol3: "1000 \u2013 1249 g \u2014 13 steps",
  protocol4: "1250 \u2013 1499 g \u2014 11 steps",
  protocol5: "1500 \u2013 1799 g \u2014 9 steps",
  protocol6: "1800 \u2013 1999 g \u2014 6 steps",
  protocol7: "2000 \u2013 2499 g \u2014 5 steps",
};

// Rounds 0.5 away from zero, as the R app's true_round() does
const EPS = Math.sqrt(2.220446049250313e-16);
const trueRound = (x, digits) => Math.sign(x) * Math.trunc(Math.abs(x) * 10 ** digits + 0.5 + EPS) / 10 ** digits;

const num = (v) => (v === "" || v == null ? NaN : Number(v));

// <= 24 wk always uses protocol 1
export function protocolFor(bw, ga) {
  bw = num(bw); ga = num(ga);
  if (Number.isNaN(bw)) return "";
  if (!Number.isNaN(ga) && ga <= 24) return "protocol1";
  return bw < 750 ? "protocol1" : bw < 1000 ? "protocol2" : bw < 1250 ? "protocol3" : bw < 1500 ? "protocol4"
    : bw < 1800 ? "protocol5" : bw < 2000 ? "protocol6" : "protocol7";
}

// Prolacta (exclusive human milk) when BW < 1500 g or GA < 32 wk; cow's-milk fortifier otherwise
export function fortificationFor(bw, ga, protocol) {
  bw = num(bw); ga = num(ga);
  if (["protocol1", "protocol2", "protocol3", "protocol4"].includes(protocol)) return "ehmd";
  if (Number.isNaN(bw)) return "";
  if (bw < 1500) return "ehmd";
  if (Number.isNaN(ga)) return "";
  return ga < 32 ? "ehmd" : "hmf";
}

// Formula may be offered only when GA >= 32 wk and weight >= 1500 g
export function formulaAllowed(bw, ga) {
  bw = num(bw); ga = num(ga);
  return !Number.isNaN(bw) && !Number.isNaN(ga) && bw >= 1500 && ga >= 32;
}

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayISO = () => isoDate(new Date()); // the device's own date
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function daysBetween(fromISO, toISO) {
  const t = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(toISO) - t(fromISO)) / 86400000);
}

// One row per day: { date, step, plan }. fort is "ehmd" or "hmf"; milk is "human_milk" or "formula".
export function buildPlan({ protocol, bw, ga, fort, milk, cream, day1 }) {
  const p = PROTOCOLS[protocol];
  bw = num(bw);
  const n = p.tf.length;
  const kcal = p.kcal.slice();
  if (fort === "ehmd") {
    kcal.forEach((k, i) => { if (k > 26) kcal[i] = 28; });
    kcal.forEach((k, i) => { if (k > 20 && k < 28) kcal[i] = 26; });
  } else if (fort === "hmf") {
    let first = true;
    kcal.forEach((k, i) => { if (k === 26) { kcal[i] = first ? 22 : 24; first = false; } });
  }
  const formula = milk === "formula" && fort === "hmf" && formulaAllowed(bw, ga);
  return p.tf.map((tf, i) => {
    let vol = bw / 1000 * tf / 8;
    vol = vol < 0.8 ? 0.5 : trueRound(vol, 0);
    let c = vol * Number(cream);
    c = c < 10 ? trueRound(c, 1) : trueRound(c, 0);
    const creamText = kcal[i] < 26 ? "" : `${c}mL cream,`;
    const volText = (vol < 1.1 && vol > 0 ? vol.toFixed(1) : String(vol)) + "mL";
    let kcalText = `${kcal[i]}kcal/oz`;
    if (formula) {
      if (bw > 2500) kcalText = "Similac or EBM 20 kcal/oz milk";
      else {
        const f = bw >= 1800 || i === 0 ? 22 : 24; // 1500-1799 g: formula 22 on day 1, then 24
        kcalText = `Formula ${f} kcal/oz or EBM ${tf >= 60 ? f : 20} kcal/oz milk`;
      }
    }
    // e.g. "0.5mL cream, 9mL (60ml/kg/d) 26kcal/oz": the rate follows the volume
    return { date: addDays(day1, i), step: `Day${i + 1}`, plan: [creamText, volText, `(${tf}ml/kg/d)`, kcalText].join(" ").trim() };
  });
}

// Text for pasting into Epic: date, step, plan, tab-separated, one day per line
export const planText = (rows) => rows.map((r) => `${r.date}\t${r.step}\t${r.plan}\n`).join("");

// Renders a share image (1200x630 PNG) for every open arb, so links to /arb/<ticker>
// show the gap when posted on X, Discord or Slack. Runs at build time after derive-data.
// Output: public/data/derived/og/<kalshi ticker>.png (gitignored with the rest of derived/).
import fs from "node:fs";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "data", "derived", "og");
const fontDir = path.join(ROOT, "node_modules", "@fontsource", "inter", "files");
const fonts = [
  { name: "Inter", data: fs.readFileSync(path.join(fontDir, "inter-latin-400-normal.woff")), weight: 400 },
  { name: "Inter", data: fs.readFileSync(path.join(fontDir, "inter-latin-700-normal.woff")), weight: 700 },
];

// Same estimate as src/lib/fees.ts
const afterFees = (k, p) => {
  const cost = k + p + 0.07 * k * (1 - k) + 0.05 * p * (1 - p);
  return ((1 - cost) / cost) * 100;
};

const h = (type, style, ...children) => ({ type, props: { style, children: children.length === 1 ? children[0] : children } });
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtDate = (d) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

function leg(venue, side, price, color) {
  return h("div", { display: "flex", flexDirection: "column", flex: 1, background: "#161b22", borderRadius: 24, padding: "28px 32px", border: `2px solid ${color}` },
    h("div", { display: "flex", fontSize: 28, color: "#9aa4b2" }, `${venue} · buy ${side}`),
    h("div", { display: "flex", fontSize: 72, fontWeight: 700, color, marginTop: 6 }, `${(price * 100).toFixed(1)}¢`),
  );
}

function card(o) {
  const net = afterFees(o.kalshi_ask, o.poly_ask);
  const closes = fmtDate(o.kalshi_end_date || o.poly_end_date);
  // The renderer adds padding outside the box, so the margins live on a fixed-size inner frame
  return h("div", { display: "flex", width: 1200, height: 630, background: "#0d1117", color: "#f0f3f6", fontFamily: "Inter" },
   h("div", { display: "flex", flexDirection: "column", width: 1072, height: 518, margin: "56px 64px" },
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "center" },
      h("div", { display: "flex", fontSize: 30, fontWeight: 700, color: "#00B3A1" }, "OmniPred"),
      h("div", { display: "flex", fontSize: 26, color: "#9aa4b2" }, "Kalshi vs Polymarket"),
    ),
    h("div", { display: "flex", fontSize: 30, color: "#9aa4b2", marginTop: 36 }, clip(o.poly_event, 70)),
    h("div", { display: "flex", fontSize: 52, fontWeight: 700, marginTop: 8 }, clip(o.poly_label, 40)),
    h("div", { display: "flex", gap: 28, marginTop: 36 },
      leg("Kalshi", o.kalshi_leg, o.kalshi_ask, "#00B3A1"),
      leg("Polymarket", o.poly_leg, o.poly_ask, "#5b8df8"),
    ),
    h("div", { display: "flex", alignItems: "baseline", marginTop: "auto", gap: 24 },
      h("div", { display: "flex", fontSize: 64, fontWeight: 700, color: "#f5b942" }, `+${o.net_profit_pct.toFixed(1)}% gap`),
      h("div", { display: "flex", fontSize: 28, color: "#9aa4b2" },
        `${net > 0 ? `about +${net.toFixed(1)}% after est. fees` : "loses after est. fees"}${closes ? ` · closes ${closes}` : ""}`),
    ),
   ),
  );
}

const arbs = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "arbitrage_opportunities.json"), "utf8"));
const best = new Map();
for (const o of arbs) {
  const cur = best.get(o.kalshi_market_id);
  if (!cur || o.net_profit_pct > cur.net_profit_pct) best.set(o.kalshi_market_id, o);
}

fs.mkdirSync(OUT, { recursive: true });
const started = Date.now();
let n = 0;
for (const [ticker, o] of best) {
  if (!/^[\w.-]+$/.test(ticker)) continue;
  const svg = await satori(card(o), { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  fs.writeFileSync(path.join(OUT, `${ticker}.png`), png);
  n++;
}
console.log(`og-images: ${n} cards in ${((Date.now() - started) / 1000).toFixed(1)}s`);

export const fmt = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const milli = (m, d = 3) => fmt(Number(m) / 1000, d);
export const short = (h, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "—");
export const pct = (x, d = 1) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(d)}%`);
export const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Quarter label for a date, e.g. 2023-01-01 -> 2023Q1
export const quarterOf = (iso) => { const [y, m] = iso.split("-").map(Number); return `${y}Q${Math.floor((m - 1) / 3) + 1}`; };

// Farmers in India usually think in acres. 1 hectare = 2.471 acres.
export const acres = (ha) => (ha == null ? "—" : fmt(ha * 2.47105, 1));
export const landText = (ha) => (ha == null ? "—" : `${acres(ha)} acres (${fmt(ha, 2)} ha)`);

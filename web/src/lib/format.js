export const fmt = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const milli = (m, d = 3) => fmt(Number(m) / 1000, d);
export const short = (h, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "—");
export const pct = (x, d = 1) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(d)}%`);
export const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Quarter label for a date, e.g. 2023-01-01 -> 2023Q1
export const quarterOf = (iso) => { const [y, m] = iso.split("-").map(Number); return `${y}Q${Math.floor((m - 1) / 3) + 1}`; };

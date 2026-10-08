// Small shared UI pieces.
import { useState } from "react";
import { short } from "../lib/format.js";

const STATUS = {
  processing: ["Processing", "bg-lagoon-light text-lagoon"],
  registered: ["Baseline committed", "bg-leaf-light text-leaf"],
  manual_review: ["Manual review", "bg-amber-light text-amber"],
  held_for_review: ["Held for review", "bg-amber-light text-amber"],
  rejected: ["Rejected", "bg-coral-light text-coral"],
  failed: ["Failed", "bg-coral-light text-coral"],
  on_chain: ["On-chain", "bg-leaf-light text-leaf"],
  ok: ["OK", "bg-leaf-light text-leaf"],
  no_data: ["No data", "bg-line text-muted"],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || [status, "bg-line text-muted"];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
    {status === "processing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lagoon" />}
    {label}
  </span>;
}

export function Hash({ value, n = 6, href }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted">—</span>;
  const copy = () => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };
  return <span className="inline-flex items-center gap-1 font-mono text-xs">
    {href ? <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-lagoon">{short(value, n)}</a> : short(value, n)}
    <button onClick={copy} title="Copy" className="rounded px-1 text-muted hover:bg-line">{copied ? "✓" : "⧉"}</button>
  </span>;
}

export function Stat({ label, value, unit, hint }) {
  return <div>
    <div className="label">{label}</div>
    <div className="mt-1 font-display text-2xl">{value}{unit && <span className="ml-1 font-sans text-sm text-muted">{unit}</span>}</div>
    {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
  </div>;
}

export function Section({ title, subtitle, right, children, className = "" }) {
  return <section className={`card p-5 sm:p-6 ${className}`}>
    {(title || right) && <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {title && <h2 className="text-xl">{title}</h2>}
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>}
    {children}
  </section>;
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="rounded-xl border border-coral/30 bg-coral-light px-4 py-3 text-sm text-coral">{children}</div>;
}

export function Note({ children, tone = "lagoon" }) {
  const cls = { lagoon: "bg-lagoon-light text-lagoon border-lagoon/20", amber: "bg-amber-light text-amber border-amber/30" }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Spinner({ className = "" }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

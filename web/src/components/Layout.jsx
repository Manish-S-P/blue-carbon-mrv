import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useWallet } from "../lib/wallet.jsx";
import { short } from "../lib/format.js";
import { Spinner } from "./ui.jsx";

function Logo() {
  return <Link to="/" className="flex items-center gap-2.5">
    <img src="/favicon.svg" alt="" className="h-9 w-9" />
    <span className="font-display text-lg leading-none">Blue Carbon <span className="text-lagoon">MRV</span></span>
  </Link>;
}

function WalletButton() {
  const { user, busy, error, signIn, signOut } = useWallet();
  const [open, setOpen] = useState(false);
  if (!user) {
    return <div className="flex flex-col items-end">
      <button className="btn-primary" onClick={() => signIn()} disabled={busy}>{busy ? <><Spinner /> Check MetaMask…</> : "Connect wallet"}</button>
      {error && <span className="mt-1 max-w-60 text-right text-xs text-coral">{error}</span>}
    </div>;
  }
  return <div className="relative">
    <button className="btn-ghost" onClick={() => setOpen(!open)}>
      <span className="h-2 w-2 rounded-full bg-leaf" />
      <span className="font-mono text-xs">{short(user.address, 4)}</span>
      {user.verifier && <span className="rounded bg-amber-light px-1.5 text-[10px] font-semibold text-amber">VERIFIER</span>}
    </button>
    {open && <div className="card absolute right-0 z-[1000] mt-2 w-64 p-4 shadow-lg">
      <div className="label">Your mock ID</div>
      <div className="mt-1 font-mono text-sm">{user.mockId}</div>
      <p className="mt-2 text-xs text-muted">This is a demo identity. We never ask for Aadhaar or other real documents.</p>
      <button className="btn-ghost mt-3 w-full" onClick={() => { signOut(); setOpen(false); }}>Sign out</button>
    </div>}
  </div>;
}

// Pages for reviewers / verifiers, kept out of the farmer's way.
function ReviewerMenu({ links }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return <div className="relative" ref={ref}>
    <button className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink" onClick={() => setOpen(!open)}>For reviewers ▾</button>
    {open && <div className="card absolute right-0 z-[1000] mt-2 w-56 p-2 shadow-lg">
      {links.map(([to, label, hint]) => <NavLink key={to} to={to} className="block rounded-lg px-3 py-2 hover:bg-sand">
        <div className="text-sm">{label}</div><div className="text-xs text-muted">{hint}</div>
      </NavLink>)}
    </div>}
  </div>;
}

export default function Layout({ children }) {
  const { user } = useWallet();
  const [menu, setMenu] = useState(false);
  const main = [["/", "Home"], ["/my-plots", "My plots"], ["/register", "Register land"]];
  const reviewer = [
    ["/verify", "Verify a credit", "Re-check any credit yourself"],
    ["/science", "Science & accuracy", "Models, tests, limits"],
    ...(user?.verifier ? [["/review", "Review queue", "Plots & quarters to check"]] : []),
    ["/system", "System status", "Is everything running?"],
  ];
  const linkCls = ({ isActive }) => `rounded-lg px-3.5 py-2 text-[15px] ${isActive ? "bg-lagoon-light font-medium text-lagoon" : "text-ink/80 hover:text-ink"}`;
  return <div className="min-h-screen">
    <header className="sticky top-0 z-[1100] border-b border-line bg-sand/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {main.map(([to, label]) => <NavLink key={to} to={to} end className={linkCls}>{label}</NavLink>)}
          <ReviewerMenu links={reviewer} />
        </nav>
        <div className="flex items-center gap-2">
          <WalletButton />
          <button className="btn-ghost md:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
        </div>
      </div>
      {menu && <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden" onClick={() => setMenu(false)}>
        {main.map(([to, label]) => <NavLink key={to} to={to} end className={linkCls}>{label}</NavLink>)}
        <div className="label mt-2 px-3.5">For reviewers</div>
        {reviewer.map(([to, label]) => <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>)}
      </nav>}
    </header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    <footer className="border-t border-line py-6 text-center text-xs text-muted">
      Final-year prototype · Satellite estimates, checked on blockchain · Not a real carbon registry yet
    </footer>
  </div>;
}

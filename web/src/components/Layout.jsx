import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import { useWallet } from "../lib/wallet.jsx";
import { short } from "../lib/format.js";
import { Spinner } from "./ui.jsx";

function Logo() {
  return <Link to="/" className="flex items-center gap-2.5">
    <img src="/favicon.svg" alt="" className="h-8 w-8" />
    <span className="font-display text-lg leading-none">Blue Carbon <span className="text-lagoon">MRV</span></span>
  </Link>;
}

function WalletButton() {
  const { user, busy, error, signIn, signOut } = useWallet();
  const [open, setOpen] = useState(false);
  if (!user) {
    return <div className="flex flex-col items-end">
      <button className="btn-primary" onClick={() => signIn()} disabled={busy}>{busy ? <Spinner /> : "Connect wallet"}</button>
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
      <div className="label">Mock identity</div>
      <div className="mt-1 text-sm">{user.name || "Unnamed farmer"}</div>
      <div className="font-mono text-xs text-muted">{user.mockId}</div>
      <p className="mt-2 text-xs text-muted">Prototype only: no Aadhaar or real personal data is collected.</p>
      <button className="btn-ghost mt-3 w-full" onClick={() => { signOut(); setOpen(false); }}>Sign out</button>
    </div>}
  </div>;
}

export default function Layout({ children }) {
  const { user } = useWallet();
  const [menu, setMenu] = useState(false);
  const links = [
    ["/dashboard", "My plots", !!user],
    ["/register", "Register plot", !!user],
    ["/verify", "Verify", true],
    ["/science", "Science", true],
    ["/review", "Review queue", !!user?.verifier],
    ["/system", "System", true],
  ].filter((l) => l[2]);
  const linkCls = ({ isActive }) => `rounded-lg px-3 py-1.5 text-sm ${isActive ? "bg-lagoon-light text-lagoon" : "text-muted hover:text-ink"}`;
  return <div className="min-h-screen">
    <header className="sticky top-0 z-[1100] border-b border-line bg-sand/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">{links.map(([to, label]) => <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>)}</nav>
        <div className="flex items-center gap-2">
          <WalletButton />
          <button className="btn-ghost md:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
        </div>
      </div>
      {menu && <nav className="flex flex-col gap-1 border-t border-line px-4 py-2 md:hidden" onClick={() => setMenu(false)}>
        {links.map(([to, label]) => <NavLink key={to} to={to} className={linkCls}>{label}</NavLink>)}
      </nav>}
    </header>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    <footer className="border-t border-line py-6 text-center text-xs text-muted">
      Final-year prototype · Polygon Amoy testnet / local Hardhat · Satellite estimates agree with GEDI & WorldCover (modelled products), not field truth
    </footer>
  </div>;
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, Leaf, LogOut, Menu, PlusCircle, X } from "lucide-react";
import { useWallet } from "../lib/wallet.jsx";

export default function Navbar() {
  const { user, signIn, signOut, busy, error } = useWallet();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const address = user?.address;

  const copy = () => navigator.clipboard?.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  const logout = () => { signOut(); navigate("/"); setOpen(false); };
  const links = [["/dashboard", "Dashboard", null], ["/register", "Register", <PlusCircle key="i" className="h-4 w-4" />]];

  return <nav className="glass sticky top-0 z-[1100] border-x-0 border-t-0">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <Link to="/" className="flex items-center gap-2.5">
        <Leaf className="h-7 w-7 text-emerald-400" />
        <span className="text-lg font-bold tracking-tight text-white">Blue Carbon<span className="ml-1 text-emerald-400">MRV</span></span>
      </Link>

      <div className="hidden items-center gap-3 md:flex">
        {user ? <>
          {links.map(([to, label, icon]) => <Link key={to} to={to} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.06] hover:text-white">{icon}{label}</Link>)}
          <button onClick={copy} title="Copy address" className="glass-card flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-white/[0.08]">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            <span className="font-mono text-xs text-slate-300">{address.slice(0, 6)}...{address.slice(-4)}</span>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
          </button>
          <button onClick={logout} title="Disconnect" className="rounded-lg p-2 text-slate-500 hover:bg-white/[0.06] hover:text-rose-400"><LogOut className="h-4 w-4" /></button>
        </> : <div className="flex flex-col items-end">
          <button onClick={() => signIn()} disabled={busy} className="btn-primary glow-emerald px-5 py-2">{busy ? "Check MetaMask…" : "Connect Wallet"}</button>
          {error && <span className="mt-1 max-w-60 text-right text-xs text-rose-400">{error}</span>}
        </div>}
      </div>

      <button onClick={() => setOpen(!open)} className="p-2 text-slate-400 hover:text-white md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
    </div>

    {open && <div className="animate-scale-in space-y-2 border-t border-white/[0.06] bg-slate-900/95 px-4 py-4 md:hidden">
      {user ? <>
        <div className="px-3 py-2 font-mono text-xs text-slate-300">{address.slice(0, 6)}...{address.slice(-4)}</div>
        {links.map(([to, label, icon]) => <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.06]">{icon}{label}</Link>)}
        <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-rose-400 hover:bg-white/[0.06]"><LogOut className="h-4 w-4" />Disconnect</button>
      </> : <button onClick={() => { signIn(); setOpen(false); }} className="btn-primary w-full py-2.5">Connect Wallet</button>}
    </div>}
  </nav>;
}

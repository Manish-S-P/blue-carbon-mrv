import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Blocks, Cpu, Globe, Lock, TreePine, Waves, Zap } from "lucide-react";
import { useWallet } from "../lib/wallet.jsx";

const FEATURES = [
  { icon: Globe, title: "Satellite Carbon", text: "Every quarter, Sentinel-1 radar and Sentinel-2 images estimate the carbon stored in your mangroves.", bg: "from-emerald-500/20 to-teal-500/20", color: "text-emerald-400" },
  { icon: Lock, title: "Locked Baseline", text: "Before any results, we predict what would happen without your project and lock it on the blockchain.", bg: "from-cyan-500/20 to-blue-500/20", color: "text-cyan-400" },
  { icon: Blocks, title: "On-chain Credits", text: "Only carbon above that locked baseline becomes an NFT credit. Anyone can verify it.", bg: "from-violet-500/20 to-purple-500/20", color: "text-violet-400" },
];

export default function Landing() {
  const { user, signIn, busy } = useWallet();
  const navigate = useNavigate();
  useEffect(() => { if (user) navigate("/dashboard"); }, [user, navigate]);

  return <div className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950" />
    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at center, #34d399 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
    <div className="animate-float absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
    <div className="animate-float-delayed absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-teal-500/10 blur-[120px]" />

    <div className="z-10 w-full max-w-6xl space-y-10 px-6 py-16 text-center md:py-24">
      <span className="glass animate-fade-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-300 uppercase">
        <Waves className="h-3.5 w-3.5" /> Blockchain-Verified Carbon Credits
      </span>
      <div className="animate-fade-up space-y-4">
        <h1 className="text-5xl leading-[0.9] font-black tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
          <span className="text-white">Blue Carbon</span><br /><span className="text-gradient">Registry</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed font-light text-slate-400 md:text-xl">
          Register your mangrove land, get it checked by satellite every quarter, and earn carbon credit NFTs for the extra carbon you protect.
        </p>
      </div>
      <div className="animate-fade-up">
        <button onClick={() => signIn()} disabled={busy}
          className="animate-pulse-glow group inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-4 font-bold text-white transition hover:-translate-y-1 hover:from-emerald-400 hover:to-teal-400">
          <span className="mr-3 text-lg">{busy ? "Check MetaMask…" : "Connect Wallet & Start"}</span>
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
        </button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-slate-500"><Zap className="h-3.5 w-3.5" /> MetaMask login required for farmer onboarding</p>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-5 border-t border-white/[0.06] pt-12 md:grid-cols-3">
        {FEATURES.map((f) => <div key={f.title} className="glass-card-hover group p-8 text-left">
          <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.bg} transition group-hover:scale-110`}><f.icon className={`h-6 w-6 ${f.color}`} /></div>
          <h3 className="mb-2 text-lg font-bold text-white">{f.title}</h3>
          <p className="text-sm leading-relaxed text-slate-400">{f.text}</p>
        </div>)}
      </div>
      <div className="flex items-center justify-center gap-8 pt-4 opacity-40"><TreePine className="h-5 w-5 text-emerald-500" /><Waves className="h-5 w-5 text-teal-500" /><Cpu className="h-5 w-5 text-cyan-500" /></div>
    </div>
  </div>;
}

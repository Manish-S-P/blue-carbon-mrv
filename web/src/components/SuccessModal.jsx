import { CheckCircle2, ChevronRight, X } from "lucide-react";

export default function SuccessModal({ title, message, txHash, buttonText = "Continue to Dashboard", onClose }) {
  return <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
    <div className="glass-card animate-scale-in relative w-full max-w-md border-emerald-500/20 p-8 shadow-2xl glow-emerald">
      <button onClick={onClose} className="absolute top-4 right-4 rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20"><CheckCircle2 className="h-8 w-8 text-emerald-400" /></div>
        <h2 className="mb-2 text-2xl font-bold text-white">{title}</h2>
        <p className="mb-8 text-sm leading-relaxed text-slate-400">{message}</p>
        {txHash && <div className="mb-8 w-full rounded-xl border border-white/5 bg-slate-900/50 p-4">
          <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Transaction Hash</p>
          <p className="mt-2 font-mono text-xs break-all text-slate-300 opacity-70">{txHash}</p>
        </div>}
        <button onClick={onClose} className="btn-primary w-full py-3">{buttonText} <ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  </div>;
}

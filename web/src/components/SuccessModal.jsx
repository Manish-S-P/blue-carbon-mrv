// Big friendly "it worked" popup (same idea as the first version of the app).
import { Hash } from "./ui.jsx";

export default function SuccessModal({ title, children, tx, actions, onClose }) {
  return <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
    <div className="card w-full max-w-md p-7 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-leaf-light text-3xl text-leaf">✓</div>
      <h2 className="mt-4 text-2xl">{title}</h2>
      <div className="mt-2 text-sm text-muted">{children}</div>
      {tx && <div className="mt-4 rounded-xl bg-sand p-3 text-left"><div className="label">Blockchain receipt</div><Hash value={tx} n={10} /></div>}
      <div className="mt-6 flex flex-col gap-2">{actions}</div>
    </div>
  </div>;
}

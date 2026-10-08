import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import MyPlots from "./pages/MyPlots.jsx";
import Register from "./pages/Register.jsx";
import PlotDetail from "./pages/PlotDetail.jsx";
import Verify from "./pages/Verify.jsx";
import Science from "./pages/Science.jsx";
import Review from "./pages/Review.jsx";
import System from "./pages/System.jsx";
import { useWallet } from "./lib/wallet.jsx";

// Pages that need a wallet show a friendly "connect" card instead of bouncing away.
function Private({ children }) {
  const { user, signIn, busy, error } = useWallet();
  if (user) return children;
  return <div className="card mx-auto max-w-md p-10 text-center">
    <div className="text-5xl">🔑</div>
    <h1 className="mt-4 text-2xl">Connect your wallet</h1>
    <p className="mt-2 text-muted">Your MetaMask wallet is your login. No password, no Aadhaar.</p>
    <button className="btn-primary mt-6 w-full py-3 text-base" disabled={busy} onClick={() => signIn()}>{busy ? "Check MetaMask…" : "Connect wallet"}</button>
    {error && <p className="mt-3 text-sm text-coral">{error}</p>}
  </div>;
}

export default function App() {
  return <Layout>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/my-plots" element={<Private><MyPlots /></Private>} />
      <Route path="/dashboard" element={<Navigate to="/my-plots" replace />} />
      <Route path="/register" element={<Private><Register /></Private>} />
      <Route path="/plots/:id" element={<PlotDetail />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/verify/:id" element={<Verify />} />
      <Route path="/science" element={<Science />} />
      <Route path="/review" element={<Private><Review /></Private>} />
      <Route path="/system" element={<System />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Layout>;
}

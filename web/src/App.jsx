import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewPlot from "./pages/NewPlot.jsx";
import PlotDetail from "./pages/PlotDetail.jsx";
import Verify from "./pages/Verify.jsx";
import Science from "./pages/Science.jsx";
import Review from "./pages/Review.jsx";
import System from "./pages/System.jsx";
import { useWallet } from "./lib/wallet.jsx";

function Private({ children }) {
  const { user } = useWallet();
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  return <Layout>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Private><Dashboard /></Private>} />
      <Route path="/register" element={<Private><NewPlot /></Private>} />
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

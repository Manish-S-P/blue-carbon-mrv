import { Navigate, Route, Routes, useParams } from "react-router-dom";
import Navbar from "./components/Navbar.jsx";
import Landing from "./pages/Landing.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Register from "./pages/Register.jsx";
import Verify from "./pages/Verify.jsx";
import Science from "./pages/Science.jsx";
import Review from "./pages/Review.jsx";
import System from "./pages/System.jsx";

// Reviewer pages (verify, science, system, review) are reachable by link but not in the main menu.
function Page({ children }) {
  return <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>;
}

function OldPlotLink() {
  const { id } = useParams();
  return <Navigate to={`/dashboard?plot=${id}`} replace />;
}

export default function App() {
  return <div className="flex min-h-screen flex-col bg-slate-950">
    <Navbar />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<Page><Verify /></Page>} />
      <Route path="/verify/:id" element={<Page><Verify /></Page>} />
      <Route path="/science" element={<Page><Science /></Page>} />
      <Route path="/review" element={<Page><Review /></Page>} />
      <Route path="/system" element={<Page><System /></Page>} />
      <Route path="/plots/:id" element={<OldPlotLink />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </div>;
}

// Direct link to one plot (for sharing with a verifier).
import { Link, useParams } from "react-router-dom";
import PlotPanel from "../components/PlotPanel.jsx";

export default function PlotDetail() {
  const { id } = useParams();
  return <div className="space-y-4">
    <Link to="/my-plots" className="text-sm text-muted hover:text-ink">← My plots</Link>
    <PlotPanel plotId={id} />
  </div>;
}

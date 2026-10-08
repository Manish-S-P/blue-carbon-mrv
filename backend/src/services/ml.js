// Client for the Python ML service (ml/api.py).
import { config } from "../config.js";

async function call(path, body) {
  const res = await fetch(`${config.mlUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15 * 60 * 1000), // Earth Engine calls can take minutes
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ML ${path} failed (${res.status}): ${data.detail || JSON.stringify(data)}`);
  return data;
}

export const ml = {
  health: () => call("/health"),
  config: () => call("/config"),
  reports: () => call("/reports"),
  region: (geometry) => call("/region", { geometry }),
  classify: (geometry, project_start) => call("/classify", { geometry, project_start }),
  baseline: (plot_id, geometry, project_start) => call("/baseline", { plot_id, geometry, project_start }),
  observe: (plot_id, geometry, quarter) => call("/observe", { plot_id, geometry, quarter }),
};

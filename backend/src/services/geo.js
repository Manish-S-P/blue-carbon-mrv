// Plot geometry checks: valid polygon, area in hectares, overlap with existing plots.
import * as turf from "@turf/turf";
import Plot from "../models/Plot.js";

export const MIN_HA = 0.5;
export const MAX_HA = 500;

export function validatePolygon(geometry) {
  if (!geometry || geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates?.[0])) {
    return "Geometry must be a GeoJSON Polygon";
  }
  const ring = geometry.coordinates[0];
  if (ring.length < 4) return "Polygon needs at least 3 corners";
  const [a, b] = [ring[0], ring[ring.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) return "Polygon ring must be closed";
  if (turf.kinks(turf.polygon(geometry.coordinates)).features.length) return "Polygon edges cross each other";
  return null;
}

export const areaHa = (geometry) => turf.area(turf.polygon(geometry.coordinates)) / 10000;

// Other live plots (not rejected/failed) whose shape intersects this one.
export async function findOverlaps(geometry, excludeId) {
  const q = { geometry: { $geoIntersects: { $geometry: geometry } }, status: { $nin: ["rejected", "failed"] } };
  if (excludeId) q._id = { $ne: excludeId };
  const hits = await Plot.find(q).select("name areaHa geometry");
  // touching edges count as intersecting in Mongo; only report real shared area
  return hits.filter((p) => {
    const inter = turf.intersect(turf.featureCollection([turf.polygon(geometry.coordinates), turf.polygon(p.geometry.coordinates)]));
    return inter && turf.area(inter) > 1; // > 1 m2
  });
}

// Leaflet maps: satellite basemap, study-area boxes, plot outlines, and a drawing tool (Geoman).
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, useMap, LayersControl } from "react-leaflet";
import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function Base() {
  return <LayersControl position="topright">
    <LayersControl.BaseLayer checked name="Satellite"><TileLayer url={SAT} attribution="Esri World Imagery" maxZoom={19} /></LayersControl.BaseLayer>
    <LayersControl.BaseLayer name="Streets"><TileLayer url={OSM} attribution="© OpenStreetMap" /></LayersControl.BaseLayer>
  </LayersControl>;
}

function FitTo({ geometry }) {
  const map = useMap();
  useEffect(() => {
    if (geometry) map.fitBounds(L.geoJSON(geometry).getBounds(), { padding: [30, 30], maxZoom: 16 });
  }, [geometry, map]);
  return null;
}

function Boxes({ boxes }) {
  if (!boxes) return null;
  return Object.entries(boxes).map(([name, [w, s, e, n]]) => <Rectangle key={name} bounds={[[s, w], [n, e]]}
    pathOptions={{ color: "#9fe0c9", weight: 1.5, dashArray: "6 6", fillOpacity: 0.04 }} />);
}

export function PlotMap({ geometry, height = 320 }) {
  return <div className="overflow-hidden rounded-xl border border-line" style={{ height }}>
    <MapContainer center={[11.43, 79.78]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
      <Base />
      {geometry && <GeoJSON key={JSON.stringify(geometry)} data={geometry} style={{ color: "#f5d76e", weight: 2.5, fillOpacity: 0.15 }} />}
      <FitTo geometry={geometry} />
    </MapContainer>
  </div>;
}

function DrawControl({ onChange }) {
  const map = useMap();
  const layerRef = useRef(null);
  useEffect(() => {
    map.pm.addControls({ position: "topleft", drawPolygon: true, drawMarker: false, drawCircleMarker: false, drawPolyline: false,
      drawRectangle: true, drawCircle: false, drawText: false, cutPolygon: false, rotateMode: false, dragMode: false });
    map.pm.setGlobalOptions({ allowSelfIntersection: false, pathOptions: { color: "#f5d76e", weight: 2.5 } });
    const emit = () => onChange(layerRef.current ? layerRef.current.toGeoJSON().geometry : null);
    const onCreate = (e) => {
      if (layerRef.current) map.removeLayer(layerRef.current); // one plot at a time
      layerRef.current = e.layer;
      e.layer.on("pm:edit", emit);
      emit();
    };
    const onRemove = () => { layerRef.current = null; emit(); };
    map.on("pm:create", onCreate);
    map.on("pm:remove", onRemove);
    return () => { map.off("pm:create", onCreate); map.off("pm:remove", onRemove); map.pm.removeControls(); };
  }, [map, onChange]);
  return null;
}

export function DrawMap({ onChange, boxes, existing, center = [11.43, 79.78] }) {
  return <div className="h-[520px] overflow-hidden rounded-xl border border-line">
    <MapContainer center={center} zoom={13} className="h-full w-full">
      <Base />
      <Boxes boxes={boxes} />
      {existing?.map((p) => <GeoJSON key={p._id} data={p.geometry} style={{ color: "#ff8a65", weight: 1.5, fillOpacity: 0.1, dashArray: "4 4" }} />)}
      <DrawControl onChange={onChange} />
    </MapContainer>
  </div>;
}

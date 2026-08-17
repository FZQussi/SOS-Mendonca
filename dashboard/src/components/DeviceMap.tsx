import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LocationPoint } from '../types';

// O ícone por omissão do Leaflet aponta para ficheiros que o bundler do Vite
// não resolve sozinho — desenha-se um pino simples em CSS puro em vez disso.
const pinIcon = L.divIcon({
  className: 'device-pin',
  html: '<span></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function Recenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon]);
  }, [lat, lon, map]);
  return null;
}

interface DeviceMapProps {
  points: LocationPoint[];
}

export function DeviceMap({ points }: DeviceMapProps) {
  if (points.length === 0) {
    return <div className="map-empty">Ainda sem localização recebida.</div>;
  }

  const last = points[0];
  const trail = points.map((p) => [p.lat, p.lon] as [number, number]);

  return (
    <MapContainer center={[last.lat, last.lon]} zoom={15} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#2F6F9E', weight: 3, opacity: 0.6 }} />}
      <Marker position={[last.lat, last.lon]} icon={pinIcon} />
      <Recenter lat={last.lat} lon={last.lon} />
    </MapContainer>
  );
}

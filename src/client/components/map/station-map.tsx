import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useRoutePath } from '@/features/stations/use-route';
import { nextTween, positionAt, type Tween } from '@/features/tracking/smooth';
import { cn } from '@/lib/utils';
import { slicePath, type RoutePath } from '@shared/geo/route';
import type { BusPosition } from '@shared/tracking/models';

export type MapStation = {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  isActive?: boolean;
};

type Props = {
  /** Stations in line order. */
  stations: readonly MapStation[];
  originId?: string | null;
  destinationId?: string | null;
  onStationClick?: (id: string) => void;
  /** Live buses; each marker glides between updates (TRK-05). */
  buses?: readonly BusPosition[];
  /** The bus whose details are open: its marker is highlighted and the map pans to it. */
  selectedBusId?: string | null;
  onBusClick?: (busId: string) => void;
  /** Number to show on a station marker (e.g. valid tickets bought there), by station id. Zero or missing shows nothing. */
  stationBadges?: Readonly<Record<string, number>>;
  /** Stations where a bus is waiting (available): drawn with a green ring so passengers can spot them. */
  availableStationIds?: ReadonlySet<string>;
  /** Admin mode: markers can be dragged and the map can be clicked to place a point. */
  editable?: {
    onStationMove: (id: string, latitude: number, longitude: number) => void;
    onMapClick?: (latitude: number, longitude: number) => void;
  };
  /** Point shown while the admin is placing a new station. */
  draftPoint?: { latitude: number; longitude: number } | null;
  className?: string;
};

type BusEntry = { marker: L.Marker; tween: Tween; lastUpdateAt: number; atStation: boolean; selected: boolean; dx: number };

/** Buses waiting at the same shelter sit side by side, not on top of one another: this is how far (px) each is shifted sideways. */
const SLOT_PX = 36;

function waitingOffsets(buses: readonly BusPosition[]): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const b of buses) {
    if (!b.atStation) continue;
    const key = `${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), b.busId]);
  }
  const offsets = new Map<string, number>();
  for (const ids of groups.values()) ids.sort().forEach((id, i) => offsets.set(id, (i - (ids.length - 1) / 2) * SLOT_PX));
  return offsets;
}

// Cavite, used until the first stations arrive.
const DEFAULT_CENTER: L.LatLngExpression = [14.39, 120.9];

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function markerIcon(station: MapStation, role: 'origin' | 'destination' | null, badge = 0, busWaiting = false) {
  const classes = ['brt-marker', role ? `brt-marker--${role}` : '', station.isActive === false ? 'brt-marker--inactive' : '']
    .filter(Boolean)
    .join(' ');
  const withBus = busWaiting ? `${classes} brt-marker--has-bus` : classes;
  const badgeHtml = badge > 0 ? `<span class="brt-badge" aria-label="${badge} valid tickets">${badge > 99 ? '99+' : badge}</span>` : '';
  return L.divIcon({ className: '', html: `<div class="${withBus}">${station.sequence}${badgeHtml}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

// Lucide "bus" glyph, inlined so the marker needs no image file.
const BUS_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
  '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
  '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';

/**
 * A bus stopped at a shelter is drawn just ABOVE the shelter's marker, not on top of it: the bus is bigger than the marker, so
 * sitting on it would hide it and swallow the tap meant for the shelter. Tap the bus for the bus, the numbered circle for the shelter.
 */
function busIcon(atStation: boolean, selected: boolean, dx = 0) {
  return L.divIcon({
    className: '',
    html: `<div class="brt-bus${atStation ? ' brt-bus--dwell' : ''}${selected ? ' brt-bus--selected' : ''}">${BUS_SVG}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16 - dx, atStation ? 50 : 16],
  });
}

/** Highlight or un-highlight a bus marker. */
function applySelection(entry: BusEntry, selected: boolean) {
  if (entry.selected === selected) return;
  entry.selected = selected;
  entry.marker.setIcon(busIcon(entry.atStation, selected, entry.dx));
}

function busLabel(bus: BusPosition) {
  const where = bus.atStation ? 'stopped at a station' : bus.nextStationName ? `next: ${bus.nextStationName}` : 'in service';
  return `${bus.busName} (${bus.plateNumber}) · ${where}`;
}

export function StationMap({
  stations,
  originId,
  destinationId,
  onStationClick,
  buses,
  selectedBusId,
  onBusClick,
  stationBadges,
  availableStationIds,
  editable,
  draftPoint,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const busLayerRef = useRef<L.LayerGroup | null>(null);
  const busEntries = useRef(new Map<string, BusEntry>());
  const draftRef = useRef<L.Marker | null>(null);
  const path: RoutePath | null = useRoutePath();
  const availableKey = availableStationIds ? [...availableStationIds].sort().join(',') : '';
  const fittedRef = useRef(false);
  // Latest callbacks, read from Leaflet event handlers so the map is never rebuilt when they change.
  const handlers = useRef({ onStationClick, onBusClick, editable });
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    handlers.current = { onStationClick, onBusClick, editable };
    selectedRef.current = selectedBusId ?? null;
  });

  // Create the map once, plus the animation loop that glides bus markers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const entries = busEntries.current;
    const map = L.map(container, { center: DEFAULT_CENTER, zoom: 12, zoomControl: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    busLayerRef.current = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => handlers.current.editable?.onMapClick?.(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;

    // Leaflet throws ("_leaflet_pos" of undefined) if anything touches a map after map.remove(), so every deferred
    // callback below checks this first.
    let disposed = false;
    let frame = 0;
    const animate = () => {
      if (disposed) return;
      const now = performance.now();
      for (const entry of entries.values()) {
        const p = positionAt(entry.tween, now);
        entry.marker.setLatLng([p.latitude, p.longitude]);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    const observer = new ResizeObserver(() => {
      if (!disposed) map.invalidateSize({ animate: false });
    });
    observer.observe(container);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      entries.clear();
      // Stop any pan / zoom animation and close open tooltips before the map's panes are torn down.
      map.stop();
      map.eachLayer((layer) => layer.closeTooltip?.());
      map.off();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      busLayerRef.current = null;
      draftRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Redraw the route line and station markers when the data or the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const active = stations.filter((s) => s.isActive !== false);
    // The road buses drive, when it is known for exactly these shelters; otherwise the shelters joined by straight lines.
    const road = path && path.stationDistances.length === active.length ? path : null;
    const line: L.LatLngTuple[] = road ? road.points.map((p): L.LatLngTuple => [p.latitude, p.longitude]) : active.map((s): L.LatLngTuple => [s.latitude, s.longitude]);
    if (line.length > 1) {
      L.polyline(line, { color: '#ffffff', weight: 11, opacity: 0.95, lineJoin: 'round', interactive: false }).addTo(layer);
      L.polyline(line, { color: '#4f46e5', weight: 6, opacity: 1, lineJoin: 'round', interactive: false }).addTo(layer);
    }

    const origin = stations.find((s) => s.id === originId);
    const destination = stations.find((s) => s.id === destinationId);
    if (origin && destination) {
      const [lo, hi] = origin.sequence < destination.sequence ? [origin, destination] : [destination, origin];
      const loIndex = active.findIndex((s) => s.id === lo.id);
      const hiIndex = active.findIndex((s) => s.id === hi.id);
      const trip: L.LatLngTuple[] =
        road && loIndex >= 0 && hiIndex >= 0
          ? slicePath(road, road.stationDistances[loIndex]!, road.stationDistances[hiIndex]!).map((p): L.LatLngTuple => [p.latitude, p.longitude])
          : active.filter((s) => s.sequence >= lo.sequence && s.sequence <= hi.sequence).map((s): L.LatLngTuple => [s.latitude, s.longitude]);
      if (trip.length > 1) L.polyline(trip, { color: '#f59e0b', weight: 7, opacity: 0.9, lineJoin: 'round' }).addTo(layer);
    }

    for (const station of stations) {
      const role = station.id === originId ? 'origin' : station.id === destinationId ? 'destination' : null;
      const badge = stationBadges?.[station.id] ?? 0;
      const busWaiting = availableKey.split(',').includes(station.id);
      const marker = L.marker([station.latitude, station.longitude], {
        icon: markerIcon(station, role, badge, busWaiting),
        draggable: Boolean(editable),
        title: station.name,
        keyboard: true,
        riseOnHover: true,
        // Above the buses (1000): a bus passing over or stopped near a shelter must never swallow the tap meant for the shelter.
        zIndexOffset: 1500,
      });
      const notes = [badge > 0 ? `${badge} valid ticket${badge === 1 ? '' : 's'}` : '', busWaiting ? 'bus waiting' : ''].filter(Boolean);
      marker.bindTooltip(notes.length > 0 ? `${station.name} · ${notes.join(' · ')}` : station.name, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => handlers.current.onStationClick?.(station.id));
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        handlers.current.editable?.onStationMove(station.id, lat, lng);
      });
      marker.addTo(layer);
    }

    // Frame the whole line once; later edits must not yank the view around.
    if (!fittedRef.current && line.length > 0) {
      map.fitBounds(L.latLngBounds(line), { padding: [30, 30], animate: false });
      fittedRef.current = true;
    }
  }, [stations, originId, destinationId, editable, stationBadges, availableKey, path]);

  // Sync bus markers with the latest positions; the animation loop moves them smoothly.
  useEffect(() => {
    const busLayer = busLayerRef.current;
    if (!busLayer) return;
    const entries = busEntries.current;
    const now = performance.now();
    const seen = new Set<string>();
    const offsets = waitingOffsets(buses ?? []);

    for (const bus of buses ?? []) {
      seen.add(bus.busId);
      const target = { latitude: bus.latitude, longitude: bus.longitude };
      const existing = entries.get(bus.busId);
      if (!existing) {
        const selected = selectedRef.current === bus.busId;
        const marker = L.marker([target.latitude, target.longitude], { icon: busIcon(bus.atStation, selected, offsets.get(bus.busId) ?? 0), zIndexOffset: 1000, keyboard: false });
        marker.bindTooltip(busLabel(bus), { direction: 'top', offset: [0, -14] });
        marker.on('click', () => handlers.current.onBusClick?.(bus.busId));
        marker.addTo(busLayer);
        entries.set(bus.busId, { marker, tween: { from: target, to: target, startedAt: now, duration: 0 }, lastUpdateAt: now, atStation: bus.atStation, selected, dx: offsets.get(bus.busId) ?? 0 });
        continue;
      }
      const here = existing.marker.getLatLng();
      existing.tween = nextTween({ latitude: here.lat, longitude: here.lng }, target, existing.lastUpdateAt, now);
      existing.lastUpdateAt = now;
      existing.marker.setTooltipContent(busLabel(bus));
      const dx = offsets.get(bus.busId) ?? 0;
      if (existing.atStation !== bus.atStation || existing.dx !== dx) {
        existing.atStation = bus.atStation;
        existing.dx = dx;
        existing.marker.setIcon(busIcon(bus.atStation, existing.selected, dx));
      }
    }
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      entry.marker.remove();
      entries.delete(id);
    }
  }, [buses]);

  // Highlight the selected bus and bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const entries = busEntries.current;
    for (const [id, entry] of entries) applySelection(entry, id === selectedBusId);
    const chosen = selectedBusId ? entries.get(selectedBusId) : undefined;
    // Only when the map is actually showing (a hidden or just-removed map has no size to pan within).
    if (chosen && map.getSize().x > 0 && !map.getBounds().contains(chosen.marker.getLatLng())) map.panTo(chosen.marker.getLatLng(), { animate: false });
  }, [selectedBusId]);

  // Draft marker for "add station".
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftRef.current?.remove();
    draftRef.current = null;
    if (draftPoint) {
      draftRef.current = L.marker([draftPoint.latitude, draftPoint.longitude], {
        icon: L.divIcon({ className: '', html: '<div class="brt-marker brt-marker--destination">+</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(map);
    }
  }, [draftPoint]);

  return <div ref={containerRef} className={cn('z-0 h-[60vh] min-h-72 w-full overflow-hidden rounded-lg border', className)} />;
}

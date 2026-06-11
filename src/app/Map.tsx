'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

type CatchmentOption = { catchment_id: string; name: string; farm_count: number };
type FilterIndex = {
  water_body_types: string[];
  river_basin_districts: string[];
  catchments: CatchmentOption[];
};

// Colour catchments by water body type. Keys must match the data values.
const WATER_BODY_COLORS: Record<string, string> = {
  River: '#2563eb',
  Lake: '#06b6d4',
  'Groundwater Body': '#9333ea',
  'Transitional Water': '#16a34a',
  'Coastal Water': '#db2777',
};
const WATER_BODY_FALLBACK = '#9ca3af';

// Mapbox match expression: water_body_type -> colour.
const waterBodyColor = [
  'match',
  ['get', 'water_body_type'],
  ...Object.entries(WATER_BODY_COLORS).flatMap(([type, color]) => [type, color]),
  WATER_BODY_FALLBACK,
] as mapboxgl.ExpressionSpecification;

const toggle = (values: string[], value: string) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

/** A labelled group of checkboxes (OR within the group). Optional `colors`
 *  renders a swatch next to each option, doubling as a legend. */
const CheckboxGroup = ({
  label,
  options,
  selected,
  onToggle,
  onClear,
  colors,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  colors?: Record<string, string>;
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      {selected.length > 0 && (
        <button className="text-xs text-blue-600 hover:underline" onClick={onClear}>
          clear
        </button>
      )}
    </div>
    <div className="space-y-0.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => onToggle(opt)}
          />
          {colors && (
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
              style={{ backgroundColor: colors[opt] ?? 'transparent' }}
            />
          )}
          <span>{opt}</span>
        </label>
      ))}
    </div>
  </div>
);

export const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [index, setIndex] = useState<FilterIndex | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Catchment-display filters: OR within each list, AND across the two.
  const [waterBodyTypes, setWaterBodyTypes] = useState<string[]>([]);
  const [riverBasinDistricts, setRiverBasinDistricts] = useState<string[]>([]);
  // Farm filter: show farms in ANY of the selected catchments.
  const [catchments, setCatchments] = useState<string[]>([]);
  const [catchmentSearch, setCatchmentSearch] = useState('');

  const visibleCatchments = useMemo(() => {
    const q = catchmentSearch.trim().toLowerCase();
    const all = index?.catchments ?? [];
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [index, catchmentSearch]);

  // Create the map, load data, add the two filtered layers.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [farms, catchmentsData, idx] = await Promise.all([
        fetch('/data/farms.geojson').then((r) => r.json()),
        fetch('/data/catchments.simplified.geojson').then((r) => r.json()),
        fetch('/data/catchments-index.json').then((r) => r.json()),
      ]);
      if (cancelled || !mapContainer.current || mapRef.current) return;

      setIndex(idx);
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        antialias: true,
      });
      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mapContainer.current);
      map.once('remove', () => resizeObserver.disconnect());

      map.on('load', () => {
        map.addSource('catchments', { type: 'geojson', data: catchmentsData });
        map.addLayer({
          id: 'catchments-fill',
          type: 'fill',
          source: 'catchments',
          paint: { 'fill-color': waterBodyColor, 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: 'catchments-line',
          type: 'line',
          source: 'catchments',
          paint: { 'line-color': waterBodyColor, 'line-width': 0.8 },
        });

        map.addSource('farms', { type: 'geojson', data: farms });
        map.addLayer({
          id: 'farms-fill',
          type: 'fill',
          source: 'farms',
          paint: { 'fill-color': '#f97316', 'fill-opacity': 0.7 },
        });
        map.addLayer({
          id: 'farms-line',
          type: 'line',
          source: 'farms',
          paint: { 'line-color': '#c2410c', 'line-width': 1 },
        });

        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Apply filters whenever a selection changes (and once the map is ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const catchExpr: unknown[] = ['all'];
    if (waterBodyTypes.length)
      catchExpr.push(['in', ['get', 'water_body_type'], ['literal', waterBodyTypes]]);
    if (riverBasinDistricts.length)
      catchExpr.push(['in', ['get', 'river_basin_district'], ['literal', riverBasinDistricts]]);
    const catchmentFilter = (catchExpr.length > 1 ? catchExpr : null) as mapboxgl.FilterSpecification | null;
    map.setFilter('catchments-fill', catchmentFilter);
    map.setFilter('catchments-line', catchmentFilter);

    const farmFilter = (catchments.length
      ? ['in', ['get', 'catchment_id'], ['literal', catchments]]
      : null) as mapboxgl.FilterSpecification | null;
    map.setFilter('farms-fill', farmFilter);
    map.setFilter('farms-line', farmFilter);
  }, [mapReady, waterBodyTypes, riverBasinDistricts, catchments]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      <div className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-72 flex-col gap-4 overflow-y-auto rounded-lg bg-white/95 p-4 text-sm text-gray-800 shadow-lg">
        <div className="space-y-3">
          <p className="font-semibold text-gray-900">Catchments</p>
          <CheckboxGroup
            label="Water body type"
            options={index?.water_body_types ?? []}
            selected={waterBodyTypes}
            onToggle={(v) => setWaterBodyTypes((s) => toggle(s, v))}
            onClear={() => setWaterBodyTypes([])}
            colors={WATER_BODY_COLORS}
          />
          <CheckboxGroup
            label="River basin district"
            options={index?.river_basin_districts ?? []}
            selected={riverBasinDistricts}
            onToggle={(v) => setRiverBasinDistricts((s) => toggle(s, v))}
            onClear={() => setRiverBasinDistricts([])}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900">Farms</p>
            {catchments.length > 0 && (
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setCatchments([])}
              >
                clear ({catchments.length})
              </button>
            )}
          </div>
          <span className="text-xs text-gray-500">In catchments</span>
          <input
            type="text"
            placeholder="Search catchments…"
            className="w-full rounded border border-gray-300 px-2 py-1"
            value={catchmentSearch}
            onChange={(e) => setCatchmentSearch(e.target.value)}
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-gray-200 p-1">
            {visibleCatchments.map((c) => (
              <label key={c.catchment_id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={catchments.includes(c.catchment_id)}
                  onChange={() => setCatchments((s) => toggle(s, c.catchment_id))}
                />
                <span className="truncate">
                  {c.name} ({c.farm_count})
                </span>
              </label>
            ))}
            {visibleCatchments.length === 0 && (
              <p className="px-1 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

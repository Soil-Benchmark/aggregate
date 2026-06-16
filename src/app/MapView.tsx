'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import {
  BarChart3,
  Check,
  Compass,
  Info,
  Landmark,
  Layers,
  Leaf,
  Map as MapIcon,
  Minus,
  Plus,
  Waves,
  X,
} from 'lucide-react';
import { Map, type LayerVisibility } from './Map';
import { SearchBar } from './SearchBar';
import { AddDialog } from './AddDialog';
import {
  loadFarmData,
  type FarmData,
  type FarmFeature,
  type FarmGroup,
  type FarmsGeoJSON,
} from '@/lib/farmData';
import { applyFilters, type Filter } from '@/lib/filters';
import area from '@turf/area';
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import union from '@turf/union';
import { cn } from '@/lib/utils';

// A boundary set indexed for fast point lookup (bbox prefilter + point-in-polygon).
type AdminEntry = { name: string; id?: string; box: number[]; feature: GeoJSON.Feature };
type AdminData = {
  counties: AdminEntry[];
  las: AdminEntry[];
  cons: AdminEntry[];
  basins: AdminEntry[];
  catchments: AdminEntry[];
  sssi: AdminEntry[];
  protectedLandscapes: AdminEntry[];
  nvz: AdminEntry[];
};

// Every boundary in `set` that the farm geometry actually intersects (bbox
// prefilter, then a real polygon-intersection test). So a cluster gets tagged
// with all the catchments/counties/etc its land touches, not just one.
const intersectingEntries = (
  farm: GeoJSON.Feature,
  farmBox: number[],
  set: AdminEntry[],
): AdminEntry[] => {
  const [fminX, fminY, fmaxX, fmaxY] = farmBox;
  const out: AdminEntry[] = [];
  for (const it of set) {
    const [minX, minY, maxX, maxY] = it.box;
    if (fmaxX < minX || fminX > maxX || fmaxY < minY || fminY > maxY) continue;
    if (booleanIntersects(farm, it.feature)) out.push(it);
  }
  return out;
};

type Basemap = 'standard' | 'satellite';

// Toggleable thematic overlays, grouped by theme in the layers panel.
const WATER_LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'rivers', label: 'Major rivers' },
  { key: 'catchments', label: 'Catchments' },
  { key: 'basins', label: 'River basins' },
];

const BOUNDARY_LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'counties', label: 'Counties' },
  { key: 'localAuthorities', label: 'Local authorities' },
  { key: 'constituencies', label: 'Constituencies' },
];

const DESIGNATION_LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'sssi', label: 'SSSIs' },
  { key: 'protectedLandscapes', label: 'National Parks & Landscapes' },
  { key: 'nvz', label: 'Nitrate Vulnerable Zones' },
];

const BASEMAPS: { key: Basemap; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'satellite', label: 'Satellite' },
];

const EMPTY_DATA: FarmData = {
  groups: [],
  farms: { type: 'FeatureCollection', features: [] },
  labels: [],
  districts: [],
};

// Shared styling for a button in the horizontal map-control pill (white,
// dark icons, ~40px — like the main Soil Benchmark map controls).
const ctrlBtn =
  'flex h-10 w-10 items-center justify-center text-slate-700 transition hover:bg-black/5';
const ctrlDivider = 'w-px self-stretch bg-slate-200';
// Round button used in the top bar (search-side controls).
const barBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20';

// A single overlay on/off row in the layers panel.
function LayerToggle({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm text-white transition hover:bg-white/10"
    >
      <span
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition',
          checked ? 'border-[#ff9933] bg-[#ff7a00] text-white' : 'border-white/40',
        )}
      >
        {checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
      </span>
      {label}
    </button>
  );
}

export const MapView = () => {
  const [data, setData] = useState<FarmData>(EMPTY_DATA);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [basemapOpen, setBasemapOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('standard');
  const [layers, setLayers] = useState<LayerVisibility>({
    catchments: false,
    basins: false,
    rivers: false,
    counties: false,
    localAuthorities: false,
    constituencies: false,
    sssi: false,
    protectedLandscapes: false,
    nvz: false,
  });
  // Admin boundary geometries, indexed for point lookup (loaded once).
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  // Wrapper around the overlays button + panel, so a click anywhere else closes it.
  const layersRef = useRef<HTMLDivElement>(null);
  // Demo stub: only authorised users can add clusters/farms. Flip to false to
  // preview the public (read-only) view. Real auth comes later.
  const isAuthorised = true;

  // Map control actions (call straight onto the Mapbox instance).
  const zoomIn = () => map?.zoomIn();
  const zoomOut = () => map?.zoomOut();
  const resetView = () => {
    map?.easeTo({ bearing: 0, pitch: 0, duration: 500 });
    setIs3D(false);
  };
  const toggle3D = () => {
    if (!map) return;
    const next = !is3D;
    map.easeTo({ pitch: next ? 60 : 0, duration: 500 });
    setIs3D(next);
  };

  const handleGroupAdded = (group: FarmGroup) =>
    setData((prev) => ({ ...prev, groups: [...prev.groups, group] }));

  // Admin: remove a cluster and all of its farms (session only).
  const handleGroupRemoved = (groupId: string) =>
    setData((prev) => ({
      ...prev,
      groups: prev.groups.filter((g) => g.groupId !== groupId),
      farms: {
        type: 'FeatureCollection',
        features: prev.farms.features.filter((f) => f.properties.group_id !== groupId),
      },
    }));

  const handleFarmAdded = (farm: FarmFeature) => {
    setData((prev) => ({
      ...prev,
      farms: {
        type: 'FeatureCollection',
        features: [...prev.farms.features, farm],
      },
    }));
    // Fly to the newly added farm so it's obvious where it landed.
    if (map) {
      const [minX, minY, maxX, maxY] = bbox(farm);
      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 80, maxZoom: 14, duration: 1000 },
      );
    }
  };

  useEffect(() => {
    let active = true;
    loadFarmData()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => console.error('Failed to load farm data', err));
    return () => {
      active = false;
    };
  }, []);

  // Load the admin boundary sets once and index them (name + bbox) so the
  // details card can show which county / LA / constituency a cluster touches.
  useEffect(() => {
    let active = true;
    const index = (
      fc: GeoJSON.FeatureCollection,
      nameField: string,
      idField?: string,
    ): AdminEntry[] =>
      (fc.features ?? [])
        .filter((f) => f.geometry)
        .map((f) => ({
          name: String(f.properties?.[nameField] ?? ''),
          id: idField ? String(f.properties?.[idField] ?? '') : undefined,
          box: bbox(f),
          feature: f,
        }));
    Promise.all([
      fetch('/data/counties.geojson').then((r) => r.json()),
      fetch('/data/local-authorities.geojson').then((r) => r.json()),
      fetch('/data/constituencies.geojson').then((r) => r.json()),
      fetch('/data/districts.geojson').then((r) => r.json()),
      fetch('/data/catchments.geojson').then((r) => r.json()),
      fetch('/data/sssi.geojson').then((r) => r.json()),
      fetch('/data/protected-landscapes.geojson').then((r) => r.json()),
      fetch('/data/nvz.geojson').then((r) => r.json()),
    ])
      .then(([c, l, p, b, ca, s, pl, nvz]: GeoJSON.FeatureCollection[]) => {
        if (!active) return;
        const riverCatch: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: (ca.features ?? []).filter(
            (f) => f.properties?.water_body_type === 'River',
          ),
        };
        setAdminData({
          counties: index(c, 'CTYUA23NM'),
          las: index(l, 'LAD24NM'),
          cons: index(p, 'PCON24NM'),
          basins: index(b, 'river_basin_district'),
          catchments: index(riverCatch, 'name', 'catchment_id'),
          sssi: index(s, 'NAME'),
          protectedLandscapes: index(pl, 'name'),
          nvz: index(nvz, 'name'),
        });
      })
      .catch((err) => console.error('Failed to load admin boundaries', err));
    return () => {
      active = false;
    };
  }, []);

  // Close the overlays panel when clicking anywhere outside it (incl. the map).
  useEffect(() => {
    if (!layersOpen) return;
    const onDown = (e: PointerEvent) => {
      if (layersRef.current && !layersRef.current.contains(e.target as Node)) {
        setLayersOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [layersOpen]);

  const visibleFarms = useMemo(
    () => applyFilters(data.farms, data.groups, filters),
    [data, filters],
  );

  // Dissolve each cluster's farms so contiguous boundaries merge into one shape
  // (removes individual field parcels — anonymises). Counts/areas are still
  // taken from the raw farms in groupStats, so they're unaffected.
  const dissolvedFarms = useMemo<FarmsGeoJSON>(() => {
    // NB: `Map` is the imported component here, so use a plain object, not `new Map`.
    const byGroup: Record<string, FarmFeature[]> = {};
    for (const f of visibleFarms.features) {
      const g = f.properties.group_id;
      (byGroup[g] ??= []).push(f);
    }
    const features: FarmFeature[] = [];
    for (const gid of Object.keys(byGroup)) {
      const feats = byGroup[gid];
      if (feats.length === 1) {
        features.push(feats[0]);
        continue;
      }
      try {
        const merged = union({
          type: 'FeatureCollection',
          features: feats,
        } as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
        if (merged) {
          features.push({
            type: 'Feature',
            properties: { ...feats[0].properties, id: `cluster-${gid}` },
            geometry: merged.geometry,
          } as FarmFeature);
          continue;
        }
      } catch {
        // fall back to the raw features if a union fails
      }
      features.push(...feats);
    }
    return { type: 'FeatureCollection', features };
  }, [visibleFarms]);

  // Per-group facts for the details card: how many farms, which river basin
  // districts they span, and which (river) catchments they intersect. Computed
  // from the full dataset, not the filtered view.
  const groupStats = useMemo(() => {
    const stats: Record<
      string,
      {
        farmCount: number;
        areaHa: number;
        districts: string[];
        catchments: { id: string; name: string }[];
        counties: string[];
        localAuthorities: string[];
        constituencies: string[];
        sssi: string[];
        protectedLandscapes: string[];
        nvz: string[];
      }
    > = {};
    const push = (arr: string[], v: string | null) => {
      if (v && !arr.includes(v)) arr.push(v);
    };
    for (const f of data.farms.features) {
      const gid = f.properties.group_id;
      const s = (stats[gid] ??= {
        farmCount: 0,
        areaHa: 0,
        districts: [],
        catchments: [],
        counties: [],
        localAuthorities: [],
        constituencies: [],
        sssi: [],
        protectedLandscapes: [],
        nvz: [],
      });
      // A feature can represent many farms (e.g. a multi-farm shapefile) — use
      // its farm_count if present, otherwise it's a single farm.
      s.farmCount += (f.properties as { farm_count?: number }).farm_count ?? 1;
      // Area worked out from the farm geometry itself (not a reported figure).
      s.areaHa += area(f) / 10_000;
      const farmBox = adminData ? bbox(f) : null;

      // River basin — from the farm if known (seed), else every basin it touches.
      const d = f.properties.river_basin_district;
      if (d) push(s.districts, d);
      else if (farmBox && adminData)
        for (const e of intersectingEntries(f, farmBox, adminData.basins))
          push(s.districts, e.name);

      // Catchment — from the farm if known, else every catchment it touches.
      const cid = f.properties.catchment_id;
      if (cid) {
        if (!s.catchments.some((c) => c.id === cid))
          s.catchments.push({ id: cid, name: f.properties.catchment_name ?? cid });
      } else if (farmBox && adminData) {
        for (const e of intersectingEntries(f, farmBox, adminData.catchments))
          if (e.id && !s.catchments.some((x) => x.id === e.id))
            s.catchments.push({ id: e.id, name: e.name });
      }

      // County / LA / constituency — every one the farm's land intersects.
      if (farmBox && adminData) {
        for (const e of intersectingEntries(f, farmBox, adminData.counties))
          push(s.counties, e.name);
        for (const e of intersectingEntries(f, farmBox, adminData.las))
          push(s.localAuthorities, e.name);
        for (const e of intersectingEntries(f, farmBox, adminData.cons))
          push(s.constituencies, e.name);
        for (const e of intersectingEntries(f, farmBox, adminData.sssi))
          push(s.sssi, e.name);
        for (const e of intersectingEntries(f, farmBox, adminData.protectedLandscapes))
          push(s.protectedLandscapes, e.name);
        for (const e of intersectingEntries(f, farmBox, adminData.nvz))
          push(s.nvz, e.name);
      }
    }
    return stats;
  }, [data.farms, adminData]);

  // River basin districts the search is currently scoped to — used to filter the
  // catchment/basin context layers so they match what the search is showing.
  const activeDistricts = useMemo(
    () => filters.flatMap((f) => (f.kind === 'riverBasin' ? [f.district] : [])),
    [filters],
  );

  // Headline stats for the whole map: cluster/farm/area totals, plus for each
  // boundary type how many features have a cluster partly in them (touched/total).
  const mapStats = useMemo(() => {
    let farms = 0;
    let areaHa = 0;
    const touched = {
      catchments: new Set<string>(),
      basins: new Set<string>(),
      counties: new Set<string>(),
      las: new Set<string>(),
      cons: new Set<string>(),
      sssi: new Set<string>(),
      pl: new Set<string>(),
      nvz: new Set<string>(),
    };
    for (const gid of Object.keys(groupStats)) {
      const s = groupStats[gid];
      farms += s.farmCount;
      areaHa += s.areaHa;
      s.catchments.forEach((c) => touched.catchments.add(c.id));
      s.districts.forEach((x) => touched.basins.add(x));
      s.counties.forEach((x) => touched.counties.add(x));
      s.localAuthorities.forEach((x) => touched.las.add(x));
      s.constituencies.forEach((x) => touched.cons.add(x));
      s.sssi.forEach((x) => touched.sssi.add(x));
      s.protectedLandscapes.forEach((x) => touched.pl.add(x));
      s.nvz.forEach((x) => touched.nvz.add(x));
    }
    const rows = adminData
      ? [
          { label: 'Catchments', touched: touched.catchments.size, total: adminData.catchments.length },
          { label: 'River basins', touched: touched.basins.size, total: adminData.basins.length },
          { label: 'Counties / UAs', touched: touched.counties.size, total: adminData.counties.length },
          { label: 'Local authorities', touched: touched.las.size, total: adminData.las.length },
          { label: 'Constituencies', touched: touched.cons.size, total: adminData.cons.length },
          { label: 'SSSIs', touched: touched.sssi.size, total: adminData.sssi.length },
          { label: 'Nat. Parks & Landscapes', touched: touched.pl.size, total: adminData.protectedLandscapes.length },
          { label: 'NVZs', touched: touched.nvz.size, total: adminData.nvz.length },
        ]
      : [];
    return { clusters: data.groups.length, farms, areaHa, rows, ready: !!adminData };
  }, [groupStats, data.groups, adminData]);

  return (
    <>
      <Map
        farms={dissolvedFarms}
        groups={data.groups}
        labels={data.labels}
        layers={layers}
        groupStats={groupStats}
        activeDistricts={activeDistricts}
        basemap={basemap}
        canEdit={isAuthorised}
        onRemoveGroup={handleGroupRemoved}
        onMapReady={setMap}
      />

      {/* Floating top bar (inset with rounded corners, like the SB platform):
          brand left, search + controls centred, discreet "powered by" right. */}
      <header className="absolute inset-x-3 top-0 z-30 flex h-14 items-center rounded-b-2xl bg-[#2e4d34] px-4 text-white shadow-lg ring-1 ring-black/10">
        {/* Brand — left */}
        <div className="flex shrink-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bubbles-orange.svg" alt="" className="h-9 w-9 shrink-0" />
          <span className="hidden text-lg font-bold tracking-tight sm:inline">
            Facilitator Forum
          </span>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            aria-label="About Facilitator Forum"
            className="shrink-0 rounded-full p-1 text-white/55 transition hover:bg-white/10 hover:text-white/90"
          >
            <Info size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            aria-label="Map statistics"
            title="Map statistics"
            className="shrink-0 rounded-full p-1 text-white/55 transition hover:bg-white/10 hover:text-white/90"
          >
            <BarChart3 size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Centred search, with the overlays + add buttons directly to its right. */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
          {/* Search grows downward over the map without stretching the bar. */}
          <div className="relative h-[38px] w-[min(32vw,360px)]">
            <div className="absolute inset-x-0 top-0">
              <SearchBar
                labels={data.labels}
                districts={data.districts}
                filters={filters}
                onChange={setFilters}
              />
            </div>
          </div>

          {/* Overlays panel (Water + Boundaries). */}
          <div ref={layersRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setLayersOpen((v) => !v)}
              aria-label="Map overlays"
              aria-pressed={layersOpen}
              title="Overlays"
              className={cn(barBtn, layersOpen && 'bg-white/25 ring-2 ring-white/40')}
            >
              <Layers size={20} aria-hidden="true" />
            </button>

            {layersOpen && (
              <div className="absolute right-0 top-[52px] z-40 w-72 origin-top-right animate-[menu-pop_160ms_ease-out] rounded-2xl bg-[#2e4d34]/95 p-3 text-white shadow-xl ring-1 ring-black/5 backdrop-blur-md">
                {/* Water */}
                <div className="flex w-fit items-center gap-1.5 rounded-lg bg-sky-200 px-2.5 py-1 text-sm font-medium text-sky-950">
                  <Waves size={16} aria-hidden="true" />
                  Water
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {WATER_LAYERS.map(({ key, label }) => (
                    <LayerToggle
                      key={key}
                      label={label}
                      checked={layers[key]}
                      onToggle={() =>
                        setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                  ))}
                </div>

                {/* Boundaries */}
                <div className="mt-3 flex w-fit items-center gap-1.5 rounded-lg bg-amber-200 px-2.5 py-1 text-sm font-medium text-amber-950">
                  <Landmark size={16} aria-hidden="true" />
                  Boundaries
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {BOUNDARY_LAYERS.map(({ key, label }) => (
                    <LayerToggle
                      key={key}
                      label={label}
                      checked={layers[key]}
                      onToggle={() =>
                        setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                  ))}
                </div>

                {/* Designations */}
                <div className="mt-3 flex w-fit items-center gap-1.5 rounded-lg bg-green-200 px-2.5 py-1 text-sm font-medium text-green-950">
                  <Leaf size={16} aria-hidden="true" />
                  Designations
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {DESIGNATION_LAYERS.map(({ key, label }) => (
                    <LayerToggle
                      key={key}
                      label={label}
                      checked={layers[key]}
                      onToggle={() =>
                        setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {isAuthorised && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="Add a cluster or farm"
              title="Add a cluster or farm"
              className={barBtn}
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Discreet attribution, far right. */}
        <a
          href="https://soilbenchmark.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Powered by Soil Benchmark (opens in a new tab)"
          className="ml-auto hidden shrink-0 items-center gap-1.5 opacity-70 transition hover:opacity-100 md:flex"
        >
          <span className="text-[10px] leading-tight text-white/60">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sb-logo.png" alt="Soil Benchmark" className="h-4 w-auto" />
        </a>
      </header>

      {/* Map controls — horizontal pill, top-left under the bar (compass, zoom,
          3D, and the basemap/map-type switcher). */}
      <div className="absolute left-3 top-[68px] z-20 flex items-stretch rounded-xl bg-white shadow-lg ring-1 ring-black/10">
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset to north / 2D"
          title="Reset north"
          className={cn(ctrlBtn, 'rounded-l-xl')}
        >
          <Compass size={20} aria-hidden="true" />
        </button>
        <span className={ctrlDivider} />
        <button type="button" onClick={zoomIn} aria-label="Zoom in" title="Zoom in" className={ctrlBtn}>
          <Plus size={20} aria-hidden="true" />
        </button>
        <span className={ctrlDivider} />
        <button type="button" onClick={zoomOut} aria-label="Zoom out" title="Zoom out" className={ctrlBtn}>
          <Minus size={20} aria-hidden="true" />
        </button>
        <span className={ctrlDivider} />
        <button
          type="button"
          onClick={toggle3D}
          aria-pressed={is3D}
          title={is3D ? 'Switch to 2D view' : 'Switch to 3D view'}
          className={cn(ctrlBtn, 'text-sm font-bold', is3D && 'bg-slate-200 text-slate-900')}
        >
          3D
        </button>
        <span className={ctrlDivider} />
        <div className="relative">
          <button
            type="button"
            onClick={() => setBasemapOpen((v) => !v)}
            aria-label="Map type"
            aria-pressed={basemapOpen}
            title="Map type"
            className={cn(ctrlBtn, 'rounded-r-xl', basemapOpen && 'bg-slate-200 text-slate-900')}
          >
            <MapIcon size={20} aria-hidden="true" />
          </button>

          {basemapOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] w-44 origin-top-left animate-[menu-pop_160ms_ease-out] rounded-xl bg-white p-2 text-slate-800 shadow-xl ring-1 ring-black/10">
              <div className="px-1.5 pb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
                Base map
              </div>
              {BASEMAPS.map(({ key, label }) => {
                const active = basemap === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setBasemap(key);
                      setBasemapOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-black/5',
                      active && 'font-semibold text-[#2e4d34]',
                    )}
                  >
                    {label}
                    {active && <Check size={15} strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <AddDialog
          groups={data.groups}
          labels={data.labels}
          onClose={() => setAddOpen(false)}
          onGroupAdded={handleGroupAdded}
          onFarmAdded={handleFarmAdded}
        />
      )}

      {/* About modal — centred, blurs the background. Opened by the "i" button. */}
      {aboutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setAboutOpen(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto animate-[menu-pop_160ms_ease-out] rounded-2xl bg-[#2e4d34]/95 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:p-8"
          >
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/bubbles-orange.svg" alt="" className="h-14 w-14 shrink-0" />
              <h2 className="text-3xl font-bold tracking-tight text-slate-100/90">
                What is the Facilitator Forum?
              </h2>
            </div>

            <div className="mt-5 space-y-3.5 text-base leading-relaxed text-white/80">
              <p>
                Facilitator Forum aims to bring together the UK&rsquo;s farmer
                groups. It is completely independent, and supported by a generous
                grant from the Frank Parkinson Agricultural Trust. The aim of this
                live map is to act as a directory of all active UK farmer groups
                (whatever their size, funding or focus).
              </p>
              <p>
                We hope this map helps both new and established groups to find each
                other and collaborate, as well as helping those wanting to work with
                groups — government, NGOs, funders, or others — discover which groups
                are relevant to them.
              </p>
            </div>
          </div>
        </div>
      )}

      {statsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setStatsOpen(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto animate-[menu-pop_160ms_ease-out] rounded-2xl bg-[#2e4d34]/95 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
          >
            <button
              type="button"
              onClick={() => setStatsOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100/90">
              Map statistics
            </h2>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-2xl font-bold">{mapStats.clusters.toLocaleString()}</div>
                <div className="text-xs text-white/60">Clusters</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-2xl font-bold">{mapStats.farms.toLocaleString()}</div>
                <div className="text-xs text-white/60">Farms</div>
              </div>
              <div className="rounded-xl bg-white/10 p-3">
                <div className="text-2xl font-bold">
                  {Math.round(mapStats.areaHa).toLocaleString()}
                </div>
                <div className="text-xs text-white/60">Hectares</div>
              </div>
            </div>

            <div className="mt-5 text-xs font-medium uppercase tracking-wider text-white/50">
              Areas with a cluster in them
            </div>
            <div className="mt-2 space-y-1.5">
              {mapStats.ready ? (
                mapStats.rows.map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
                  >
                    <span className="text-white/80">{r.label}</span>
                    <span className="font-semibold">
                      <span className="text-[#ff9933]">{r.touched.toLocaleString()}</span>
                      <span className="text-white/50"> / {r.total.toLocaleString()}</span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/50">Loading boundary data…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

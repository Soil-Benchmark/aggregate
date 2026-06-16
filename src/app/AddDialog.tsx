'use client';

import { useState } from 'react';
import { ArrowLeft, Hash, MapPin, Tractor, Upload, Users, X } from 'lucide-react';
import type { FarmFeature, FarmGroup, Label } from '@/lib/farmData';
import union from '@turf/union';
import buffer from '@turf/buffer';
import proj4 from 'proj4';
import { cn, readableText } from '@/lib/utils';

// British National Grid → so we can reproject UK shapefiles to WGS84 for Mapbox.
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
    '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
);
// Reproject a position to WGS84 only if it looks like BNG (metres, out of lat/lng range).
const toWgs84 = (pos: number[]): [number, number] => {
  if (Math.abs(pos[0]) > 180 || Math.abs(pos[1]) > 90) {
    const [lng, lat] = proj4('EPSG:27700', 'WGS84', [pos[0], pos[1]]);
    return [lng, lat];
  }
  return [pos[0], pos[1]];
};
const reprojectPolygon = (poly: number[][][]): number[][][] =>
  poly.map((ring) => ring.map((p) => toWgs84(p)));

type AddDialogProps = {
  groups: FarmGroup[];
  labels: Label[];
  onClose: () => void;
  onGroupAdded: (group: FarmGroup) => void;
  onFarmAdded: (farm: FarmFeature) => void;
};

type Mode = 'choose' | 'cluster' | 'farm';
// How a farm's boundary is provided. Shapefile is the preferred route (real
// boundaries); SBI fetches them from the holding; postcode is the legacy circle.
type FarmMethod = 'shapefile' | 'sbi' | 'postcode';

type GeocodeResult = {
  id: string;
  label: string;
  lng: number;
  lat: number;
  postcode: string;
};

const inputClass =
  'w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none ring-1 ring-white/15 transition focus:ring-white/50';
const labelClass = 'mb-1 block text-xs font-medium text-white/60';
const primaryBtn =
  'rounded-lg bg-[#ff7a00] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff8c1a] disabled:cursor-not-allowed disabled:opacity-50';

export const AddDialog = ({
  groups,
  labels,
  onClose,
  onGroupAdded,
  onFarmAdded,
}: AddDialogProps) => {
  const [mode, setMode] = useState<Mode>('choose');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Farm form state ---
  const [farmMethod, setFarmMethod] = useState<FarmMethod>('shapefile');
  const [farmGroupId, setFarmGroupId] = useState('');
  const [farmFile, setFarmFile] = useState<File | null>(null);
  const [sbis, setSbis] = useState('');
  // postcode (legacy) sub-state
  const [addrQuery, setAddrQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [hectares, setHectares] = useState('');

  // --- Cluster form state ---
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const [clusterFile, setClusterFile] = useState<File | null>(null);
  const [clusterFarmCount, setClusterFarmCount] = useState('');

  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  const searchAddress = async () => {
    const q = addrQuery.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
        q,
      )}&country=gb&limit=5&access_token=${token}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
      const json = await res.json();
      const next: GeocodeResult[] = (json.features ?? []).map(
        (f: {
          id?: string;
          geometry: { coordinates: [number, number] };
          properties: {
            full_address?: string;
            name?: string;
            context?: { postcode?: { name?: string } };
          };
        }) => ({
          id: f.id ?? `${f.geometry.coordinates.join(',')}`,
          label: f.properties.full_address ?? f.properties.name ?? 'Unknown place',
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          postcode: f.properties.context?.postcode?.name ?? '',
        }),
      );
      setResults(next);
      if (next.length === 0) setError('No matching addresses found.');
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  // Parse a shapefile (.zip) / GeoJSON file into one merged farm geometry.
  const parseFarmFile = async (file: File): Promise<GeoJSON.Geometry | null> => {
    const lower = file.name.toLowerCase();
    let fc: GeoJSON.FeatureCollection;
    if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
      fc = JSON.parse(await file.text());
    } else {
      const shp = (await import('shpjs')).default as (
        b: ArrayBuffer,
      ) => Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;
      const out = await shp(await file.arrayBuffer());
      fc = Array.isArray(out)
        ? { type: 'FeatureCollection', features: out.flatMap((o) => o.features) }
        : out;
    }
    const coords: number[][][][] = [];
    for (const f of fc.features ?? []) {
      const g = f.geometry;
      if (g?.type === 'Polygon')
        coords.push(reprojectPolygon(g.coordinates as number[][][]));
      else if (g?.type === 'MultiPolygon')
        for (const p of g.coordinates as number[][][][]) coords.push(reprojectPolygon(p));
    }
    if (coords.length === 0) return null;
    let geometry: GeoJSON.Geometry = { type: 'MultiPolygon', coordinates: coords };
    if (coords.length > 1) {
      try {
        const merged = union({
          type: 'FeatureCollection',
          features: coords.map((c) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Polygon' as const, coordinates: c },
          })),
        });
        if (merged) geometry = merged.geometry;
      } catch {
        // keep the un-merged MultiPolygon
      }
    }
    return geometry;
  };

  const makeFarm = (
    geometry: GeoJSON.Geometry,
    groupId: string,
    id: string,
    farmCount = 1,
  ): FarmFeature =>
    ({
      type: 'Feature',
      geometry,
      properties: {
        id,
        postcode: '',
        group_id: groupId,
        // One uploaded shapefile can represent many farms — carry that count so
        // the cluster popup reports the real number of farms, not 1 feature.
        farm_count: farmCount,
        river_basin_district: null,
        catchment_id: null,
        catchment_name: null,
      },
    }) as unknown as FarmFeature;

  const submitFarmPostcode = async () => {
    if (!farmGroupId) return setError('Choose a group.');
    if (!picked) return setError('Search for and choose an address first.');
    const ha = Number(hectares);
    if (!(ha > 0)) return setError('Enter a farm size in hectares.');
    setSubmitting(true);
    setError(null);
    try {
      let farm: FarmFeature | null = null;
      // Try the live API; if storage isn't configured (local dev / no GCS),
      // fall back to building the circle client-side (session only) — same as
      // the cluster/shapefile/SBI routes, so the postcode add never dead-ends.
      try {
        const res = await fetch('/api/farms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: farmGroupId,
            lng: picked.lng,
            lat: picked.lat,
            hectares: ha,
            postcode: picked.postcode,
            address: picked.label,
          }),
        });
        if (res.ok) farm = (await res.json()).farm;
      } catch {
        // ignore — fall back to local
      }
      if (!farm) {
        // Circle whose area equals the stated hectares: radius = sqrt(area/π).
        // Mirrors the /api/farms server logic with turf buffer.
        const point: GeoJSON.Feature<GeoJSON.Point> = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [picked.lng, picked.lat] },
        };
        const radiusMetres = Math.sqrt((ha * 10000) / Math.PI);
        const circle = buffer(point, radiusMetres, { units: 'meters', steps: 24 });
        if (!circle) {
          setError('Failed to compute farm geometry.');
          return;
        }
        farm = makeFarm(circle.geometry, farmGroupId, `pc-${Date.now()}`);
      }
      onFarmAdded(farm);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Parse an uploaded shapefile (.zip) or GeoJSON, reproject if needed, merge
  // the parcels, and add it to the cluster in this session (no live write).
  const submitShapefile = async () => {
    if (!farmGroupId) return setError('Choose a group.');
    if (!farmFile) return setError('Choose a shapefile (.zip) or GeoJSON to upload.');
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const geometry = await parseFarmFile(farmFile);
      if (!geometry) {
        setError('No polygon boundaries found in that file.');
        return;
      }
      onFarmAdded(makeFarm(geometry, farmGroupId, `shp-${farmFile.name}`));
      onClose();
    } catch (e) {
      setError(`Could not read that file: ${e}`);
    } finally {
      setSubmitting(false);
    }
  };

  // SBI lookup IS wired: fetches real field boundaries from the public RPA WFS
  // (via our read-only /api/sbi proxy) and adds them to the map in this session
  // only. It does NOT write to the live database.
  const submitSbi = async () => {
    if (!farmGroupId) return setError('Choose a group.');
    const sbiList = sbis
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sbiList.length === 0) return setError('Enter one or more SBI numbers.');
    setSubmitting(true);
    setError(null);
    setNotice(null);
    let added = 0;
    const failures: string[] = [];
    try {
      for (const sbi of sbiList) {
        const res = await fetch(`/api/sbi?sbi=${encodeURIComponent(sbi)}`);
        const data = await res.json();
        if (!res.ok) {
          failures.push(`${sbi}: ${data.error ?? res.status}`);
          continue;
        }
        const feats = (data.features ?? []) as { geometry: GeoJSON.Geometry | null }[];
        const coords: number[][][][] = [];
        for (const f of feats) {
          const g = f.geometry;
          if (g?.type === 'Polygon') coords.push(g.coordinates as number[][][]);
          else if (g?.type === 'MultiPolygon')
            coords.push(...(g.coordinates as number[][][][]));
        }
        if (coords.length === 0) {
          failures.push(`${sbi}: no parcels found`);
          continue;
        }
        // Merge the holding's parcels so internal field boundaries disappear
        // (anonymises, and collapses the 100s of individual parcels into one).
        let geometry: GeoJSON.Geometry = { type: 'MultiPolygon', coordinates: coords };
        if (coords.length > 1) {
          try {
            const merged = union({
              type: 'FeatureCollection',
              features: coords.map((c) => ({
                type: 'Feature' as const,
                properties: {},
                geometry: { type: 'Polygon' as const, coordinates: c },
              })),
            });
            if (merged) geometry = merged.geometry;
          } catch {
            // keep the un-merged MultiPolygon as a fallback
          }
        }
        const farm = {
          type: 'Feature',
          geometry,
          properties: {
            id: `sbi-${sbi}`,
            postcode: '',
            group_id: farmGroupId,
            river_basin_district: null,
            catchment_id: null,
            catchment_name: null,
          },
        } as unknown as FarmFeature;
        onFarmAdded(farm);
        added += 1;
      }
      if (added > 0) {
        onClose();
      } else {
        setError(failures.join(' · ') || 'No farms added.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCluster = async () => {
    if (!name.trim() || !contactName.trim() || !contactEmail.trim()) {
      return setError('Name, contact name and contact email are required.');
    }
    setSubmitting(true);
    setError(null);
    try {
      let group: FarmGroup | null = null;
      // Try the live API; if storage isn't configured (local dev / no GCS),
      // fall back to creating the cluster in this session only.
      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            website,
            contactName,
            contactEmail,
            labels: chosenLabels,
          }),
        });
        if (res.ok) group = (await res.json()).group;
      } catch {
        // ignore — fall back to local
      }
      if (!group) {
        group = {
          groupId: `local-${Date.now()}`,
          name,
          description,
          website,
          contactName,
          contactEmail,
          labels: chosenLabels,
        };
      }
      onGroupAdded(group);

      // Optionally seed the cluster's farms from the attached shapefile.
      if (clusterFile) {
        const geometry = await parseFarmFile(clusterFile);
        if (geometry)
          onFarmAdded(
            makeFarm(
              geometry,
              group.groupId,
              `shp-${clusterFile.name}`,
              Number(clusterFarmCount) || 1,
            ),
          );
      }
      onClose();
    } catch (err) {
      setError(`Could not create group: ${err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLabel = (label: string) =>
    setChosenLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );

  const clusterSelect = (
    <div>
      <label className={labelClass}>Group</label>
      <select
        value={farmGroupId}
        onChange={(e) => setFarmGroupId(e.target.value)}
        className={cn(inputClass, 'appearance-none')}
      >
        <option value="" className="text-gray-900">
          Choose a group…
        </option>
        {sortedGroups.map((g) => (
          <option key={g.groupId} value={g.groupId} className="text-gray-900">
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );

  // What the worm loader says while we work.
  const loadingLabel =
    mode === 'cluster'
      ? 'Adding your group…'
      : farmMethod === 'sbi'
        ? 'Fetching farm boundaries…'
        : 'Adding your farm…';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto animate-[menu-pop_160ms_ease-out] rounded-2xl bg-[#2e4d34]/95 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
      >
        {/* Worm loader — the same wiggling worm the main Soil Benchmark app shows
            while it fetches farm boundaries. Covers the form while we work. */}
        {submitting && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-2xl bg-[#2e4d34]/97 px-6 text-center backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/bubbles-orange.svg" alt="" className="h-9 w-9" />
              <span className="text-xl font-bold tracking-tight text-slate-100/90">
                Facilitator Forum
              </span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/loading_fat_worm_static.svg"
              alt="Loading"
              className="h-20 w-20 animate-spin [animation-duration:1.6s] [will-change:transform]"
            />
            <p className="text-base font-medium text-white/85">{loadingLabel}</p>
            <p className="max-w-xs text-xs text-white/50">
              This can take a moment while we fetch and tidy up the boundaries.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>

        {mode !== 'choose' && (
          <button
            type="button"
            onClick={() => {
              setMode('choose');
              setError(null);
              setNotice(null);
            }}
            className="mb-3 inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-white"
          >
            <ArrowLeft size={14} /> Back
          </button>
        )}

        {mode === 'choose' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add to the map
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Register a new farmer group, or add a farm to an existing one.
            </p>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={() => setMode('cluster')}
                className="flex items-center gap-3 rounded-xl bg-white/10 p-4 text-left ring-1 ring-white/15 transition hover:bg-white/15"
              >
                <Users size={22} className="shrink-0 text-[#ff9933]" />
                <span>
                  <span className="block text-sm font-semibold">Add a group</span>
                  <span className="block text-xs text-white/60">
                    Register a new farmer group — and optionally add its farms in
                    one go.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode('farm')}
                className="flex items-center gap-3 rounded-xl bg-white/10 p-4 text-left ring-1 ring-white/15 transition hover:bg-white/15"
              >
                <Tractor size={22} className="shrink-0 text-[#ff9933]" />
                <span>
                  <span className="block text-sm font-semibold">Add a farm</span>
                  <span className="block text-xs text-white/60">
                    Add a farm to an existing group by shapefile or SBI.
                  </span>
                </span>
              </button>
            </div>
            <p className="mt-4 text-[11px] text-white/40">
              Adding to the map is limited to authorised users.
            </p>
          </>
        )}

        {mode === 'cluster' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add a group
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Group name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. The Furrow Fellowship"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What the group is about"
                  className={cn(inputClass, 'resize-none')}
                />
              </div>
              <div>
                <label className={labelClass}>Website (optional)</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact name</label>
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Labels</label>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((l) => {
                    const selected = chosenLabels.includes(l.label);
                    return (
                      <button
                        key={l.label}
                        type="button"
                        onClick={() => toggleLabel(l.label)}
                        className={cn(
                          'rounded-full border-transparent px-3 py-1 text-xs font-semibold transition',
                          selected
                            ? 'ring-2 ring-white'
                            : 'opacity-70 hover:opacity-100',
                        )}
                        style={{
                          backgroundColor: l.color,
                          color: readableText(l.color),
                        }}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional: seed the cluster's farms from one shapefile. */}
              <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                <label className={labelClass}>
                  Add this group&rsquo;s farms now (optional)
                </label>
                <p className="mb-2 text-[11px] text-white/45">
                  Upload one shapefile containing all the group&rsquo;s farms, then
                  tell us how many farms it represents.
                </p>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15 transition hover:bg-white/15">
                  <Upload size={15} className="text-[#ff9933]" />
                  <span className="truncate text-white/80">
                    {clusterFile ? clusterFile.name : 'Choose shapefile (.zip) or GeoJSON'}
                  </span>
                  <input
                    type="file"
                    accept=".zip,.geojson,.json"
                    className="hidden"
                    onChange={(e) => setClusterFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {clusterFile && (
                  <div className="mt-2">
                    <label className={labelClass}>How many farms does it represent?</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={clusterFarmCount}
                      onChange={(e) => setClusterFarmCount(e.target.value)}
                      placeholder="e.g. 12"
                      className={inputClass}
                    />
                  </div>
                )}
              </div>
            </div>

            {error && <p className="mt-3 text-xs text-red-200">{error}</p>}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={submitCluster}
                disabled={submitting}
                className={primaryBtn}
              >
                {submitting ? 'Adding…' : 'Add group'}
              </button>
            </div>
          </>
        )}

        {mode === 'farm' && (
          <>
            <h2 className="text-xl font-bold tracking-tight text-slate-100/90">
              Add a farm
            </h2>

            {/* Method selector — shapefile preferred, postcode is the legacy circle. */}
            <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
              {(
                [
                  { key: 'shapefile', label: 'Shapefile', icon: Upload },
                  { key: 'sbi', label: 'SBI', icon: Hash },
                  { key: 'postcode', label: 'Postcode', icon: MapPin },
                ] as { key: FarmMethod; label: string; icon: typeof Upload }[]
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setFarmMethod(key);
                    setError(null);
                    setNotice(null);
                  }}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    farmMethod === key
                      ? 'bg-white/20 text-white'
                      : 'text-white/60 hover:bg-white/10',
                  )}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            {farmMethod === 'postcode' && (
              <p className="mt-1.5 text-[11px] text-white/40">
                Legacy option — draws a circle from a postcode. Prefer a shapefile or
                SBI for a real boundary.
              </p>
            )}

            <div className="mt-4 space-y-4">
              {clusterSelect}

              {farmMethod === 'shapefile' && (
                <div>
                  <label className={labelClass}>Farm boundary</label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/15 transition hover:bg-white/15">
                    <Upload size={15} className="text-[#ff9933]" />
                    <span className="truncate text-white/80">
                      {farmFile ? farmFile.name : 'Choose shapefile (.zip) or GeoJSON'}
                    </span>
                    <input
                      type="file"
                      accept=".zip,.geojson,.json"
                      className="hidden"
                      onChange={(e) => setFarmFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              )}

              {farmMethod === 'sbi' && (
                <div>
                  <label className={labelClass}>SBI number(s)</label>
                  <textarea
                    value={sbis}
                    onChange={(e) => setSbis(e.target.value)}
                    rows={3}
                    placeholder="One SBI per line — each is added as a farm"
                    className={cn(inputClass, 'resize-none')}
                  />
                  <p className="mt-1 text-[11px] text-white/40">
                    Boundaries are fetched from each holding (England).
                  </p>
                </div>
              )}

              {farmMethod === 'postcode' && (
                <>
                  <div>
                    <label className={labelClass}>Address</label>
                    <div className="flex gap-2">
                      <input
                        value={addrQuery}
                        onChange={(e) => setAddrQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            searchAddress();
                          }
                        }}
                        placeholder="Postcode or address"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={searchAddress}
                        disabled={searching}
                        className="shrink-0 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/25 disabled:opacity-50"
                      >
                        {searching ? '…' : 'Search'}
                      </button>
                    </div>
                    {results.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {results.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setPicked(r);
                                setResults([]);
                                setAddrQuery(r.label);
                              }}
                              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-white/90 transition hover:bg-white/10"
                            >
                              <MapPin size={14} className="mt-0.5 shrink-0 text-white/50" />
                              {r.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {picked && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80">
                        <MapPin size={12} className="text-[#ff9933]" />
                        {picked.label}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Farm size (hectares)</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={hectares}
                      onChange={(e) => setHectares(e.target.value)}
                      placeholder="e.g. 120"
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-red-200">{error}</p>}
            {notice && (
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
                {notice}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={
                  farmMethod === 'postcode'
                    ? submitFarmPostcode
                    : farmMethod === 'sbi'
                      ? submitSbi
                      : submitShapefile
                }
                disabled={submitting}
                className={primaryBtn}
              >
                {submitting ? 'Adding…' : 'Add farm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

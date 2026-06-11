'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Layers, Waves } from 'lucide-react';
import { Map, type LayerVisibility } from './Map';
import { SearchBar } from './SearchBar';
import { loadFarmData, type FarmData } from '@/lib/farmData';
import { applyFilters, type Filter } from '@/lib/filters';
import { cn } from '@/lib/utils';

// Toggleable map layers, grouped by theme in the layers panel.
const WATER_LAYERS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'catchments', label: 'Catchments' },
  { key: 'basins', label: 'River basins' },
];

const EMPTY_DATA: FarmData = {
  groups: [],
  farms: { type: 'FeatureCollection', features: [] },
  labels: [],
  districts: [],
};

export const MapView = () => {
  const [data, setData] = useState<FarmData>(EMPTY_DATA);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>({
    catchments: false,
    basins: false,
  });

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

  const visibleFarms = useMemo(
    () => applyFilters(data.farms, data.groups, filters),
    [data, filters],
  );

  // Per-group facts for the details card: how many farms, which river basin
  // districts they span, and which (river) catchments they intersect. Computed
  // from the full dataset, not the filtered view.
  const groupStats = useMemo(() => {
    const stats: Record<
      string,
      {
        farmCount: number;
        districts: string[];
        catchments: { id: string; name: string }[];
      }
    > = {};
    for (const f of data.farms.features) {
      const gid = f.properties.group_id;
      const s = (stats[gid] ??= { farmCount: 0, districts: [], catchments: [] });
      s.farmCount += 1;
      const d = f.properties.river_basin_district;
      if (d && !s.districts.includes(d)) s.districts.push(d);
      const cid = f.properties.catchment_id;
      if (cid && !s.catchments.some((c) => c.id === cid)) {
        s.catchments.push({ id: cid, name: f.properties.catchment_name ?? cid });
      }
    }
    return stats;
  }, [data.farms]);

  // River basin districts the search is currently scoped to — used to filter the
  // catchment/basin context layers so they match what the search is showing.
  const activeDistricts = useMemo(
    () => filters.flatMap((f) => (f.kind === 'riverBasin' ? [f.district] : [])),
    [filters],
  );

  return (
    <>
      <Map
        farms={visibleFarms}
        groups={data.groups}
        labels={data.labels}
        layers={layers}
        groupStats={groupStats}
        activeDistricts={activeDistricts}
      />
      {/* Spotlight-style row: search bar with the layers control floating just
          to its right. Top-aligned so the button stays put as the bar grows. */}
      <div className="absolute left-1/2 top-4 z-20 flex w-[min(94vw,800px)] -translate-x-1/2 items-start gap-3">
        <div className="min-w-0 flex-1">
          <SearchBar
            labels={data.labels}
            districts={data.districts}
            filters={filters}
            onChange={setFilters}
          />
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setLayersOpen((v) => !v)}
            aria-label="Map layers"
            aria-pressed={layersOpen}
            className={cn(
              'flex h-[52px] w-[52px] items-center justify-center rounded-full bg-slate-500/80 text-white shadow-xl ring-1 ring-black/5 backdrop-blur-md transition hover:bg-slate-500',
              layersOpen && 'ring-2 ring-white',
            )}
          >
            <Layers size={22} aria-hidden="true" />
          </button>

          {layersOpen && (
            <div className="absolute left-0 top-[60px] w-56 origin-top-left animate-[menu-pop_160ms_ease-out] rounded-2xl bg-slate-500/80 p-3 text-white shadow-xl ring-1 ring-black/5 backdrop-blur-md">
              {/* Water group — header matches the "river basin" search tag. */}
              <div className="flex w-fit items-center gap-1.5 rounded-lg bg-sky-200 px-2.5 py-1 text-sm font-medium text-sky-950">
                <Waves size={16} aria-hidden="true" />
                Water
              </div>

              <div className="mt-2 flex flex-col gap-0.5">
                {WATER_LAYERS.map(({ key, label }) => {
                  const checked = layers[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() =>
                        setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm text-white transition hover:bg-white/10"
                    >
                      <span
                        className={cn(
                          'flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition',
                          checked
                            ? 'border-[#ff9933] bg-[#ff7a00] text-white'
                            : 'border-white/40',
                        )}
                      >
                        {checked && (
                          <Check size={13} strokeWidth={3} aria-hidden="true" />
                        )}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

'use client';

import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { FilterIndex, WATER_BODY_COLORS, toggle } from './catchmentFilters';

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

type FilterPanelProps = {
  index: FilterIndex | null;
  waterBodyTypes: string[];
  setWaterBodyTypes: Dispatch<SetStateAction<string[]>>;
  riverBasinDistricts: string[];
  setRiverBasinDistricts: Dispatch<SetStateAction<string[]>>;
  catchments: string[];
  setCatchments: Dispatch<SetStateAction<string[]>>;
};

export const FilterPanel = ({
  index,
  waterBodyTypes,
  setWaterBodyTypes,
  riverBasinDistricts,
  setRiverBasinDistricts,
  catchments,
  setCatchments,
}: FilterPanelProps) => {
  const [catchmentSearch, setCatchmentSearch] = useState('');

  const visibleCatchments = useMemo(() => {
    const q = catchmentSearch.trim().toLowerCase();
    const all = index?.catchments ?? [];
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [index, catchmentSearch]);

  return (
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
  );
};

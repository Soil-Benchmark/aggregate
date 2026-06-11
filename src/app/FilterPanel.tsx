'use client';

import { Dispatch, SetStateAction } from 'react';
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
  farmDistricts: string[];
  setFarmDistricts: Dispatch<SetStateAction<string[]>>;
};

export const FilterPanel = ({
  index,
  waterBodyTypes,
  setWaterBodyTypes,
  riverBasinDistricts,
  setRiverBasinDistricts,
  farmDistricts,
  setFarmDistricts,
}: FilterPanelProps) => {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg bg-white/95 p-4 text-sm text-gray-800 shadow-lg">
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
          {farmDistricts.length > 0 && (
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setFarmDistricts([])}
            >
              clear ({farmDistricts.length})
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500">In river basin district</span>
        <div className="space-y-0.5">
          {(index?.districts ?? []).map((d) => (
            <label key={d.river_basin_district} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={farmDistricts.includes(d.river_basin_district)}
                onChange={() =>
                  setFarmDistricts((s) => toggle(s, d.river_basin_district))
                }
              />
              <span className="truncate">
                {d.river_basin_district} ({d.farm_count})
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

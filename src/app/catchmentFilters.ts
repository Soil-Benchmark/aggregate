// Shared types, colours, and helpers for the farm/catchment filters — used by
// both the map (colour expression) and the filter panel (legend swatches).

export type CatchmentOption = { catchment_id: string; name: string; farm_count: number };

export type FilterIndex = {
  water_body_types: string[];
  river_basin_districts: string[];
  catchments: CatchmentOption[];
};

// Colour catchments by water body type. Keys must match the data values.
export const WATER_BODY_COLORS: Record<string, string> = {
  River: '#2563eb',
  Lake: '#06b6d4',
  'Groundwater Body': '#9333ea',
  'Transitional Water': '#16a34a',
  'Coastal Water': '#db2777',
};
export const WATER_BODY_FALLBACK = '#9ca3af';

// Toggle a value's membership in a selection array.
export const toggle = (values: string[], value: string) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

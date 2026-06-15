// Catchment colours, by water body type, for the map's colour expression.

// Keys must match the `water_body_type` values in the data.
export const WATER_BODY_COLORS: Record<string, string> = {
  // Teal — stays distinct from royal-blue major rivers and sky-blue river basins.
  River: '#0d9488',
  Lake: '#06b6d4',
  'Groundwater Body': '#9333ea',
  'Transitional Water': '#16a34a',
  'Coastal Water': '#db2777',
};
export const WATER_BODY_FALLBACK = '#9ca3af';

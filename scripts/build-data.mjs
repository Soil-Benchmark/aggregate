// Build the static artifacts the app loads at runtime, derived from the raw
// source geojson in public/. Run: `node scripts/build-data.mjs`
//
// Inputs  (full fidelity, NOT shipped to the browser):
//   public/farms.geojson        farm polygons
//   public/districts.geojson    10 river basin district MultiPolygons
//   public/catchments.geojson   4,773 catchment MultiPolygons (filter options)
//
// Outputs (small, shipped to the browser — written to public/data/):
//   farms-by-district.geojson   farms deduped + river_basin_district baked on
//   filters-index.json          dropdown options (filter values + district list)
//
// The simplified catchment geometry for *display* is produced separately by
// mapshaper (see package.json "build:data"). Assignment here uses the
// FULL-precision districts so farms near a boundary aren't misassigned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { centroid } from '@turf/centroid';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { bbox } from '@turf/bbox';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const OUT = path.join(PUBLIC, 'data');
const load = (name) => JSON.parse(fs.readFileSync(path.join(PUBLIC, name), 'utf8'));

const farmsFC = load('farms.geojson');
const districtsFC = load('districts.geojson');
const catchmentsFC = load('catchments.geojson');

// --- 1. Dedupe farms (source has geometrically-identical duplicate features) ---
const seen = new Set();
const farms = farmsFC.features.filter((f) => {
  if (seen.has(f.properties.id)) return false;
  seen.add(f.properties.id);
  return true;
});
console.log(`farms: ${farmsFC.features.length} features -> ${farms.length} unique`);

// --- 2. Assign each farm to a river basin district + its river catchment ---
// (centroid point-in-polygon). Precompute bboxes once; prune by bbox before
// the expensive test. Catchments are restricted to River water bodies, to
// match the catchment layer the app displays.
const boxes = districtsFC.features.map((d) => ({ d, box: bbox(d) }));
const riverCatchments = catchmentsFC.features.filter(
  (c) => c.properties.water_body_type === 'River',
);
const catchBoxes = riverCatchments.map((c) => ({ c, box: bbox(c) }));
const districtCount = new Map(); // river_basin_district -> number of farms
let unassigned = 0;
let noCatchment = 0;

for (const farm of farms) {
  const center = centroid(farm);
  const [x, y] = center.geometry.coordinates;

  let hit = null;
  for (const { d, box } of boxes) {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    if (booleanPointInPolygon(center, d)) { hit = d; break; }
  }
  if (hit) {
    const name = hit.properties.river_basin_district;
    farm.properties.river_basin_district = name;
    districtCount.set(name, (districtCount.get(name) || 0) + 1);
  } else {
    farm.properties.river_basin_district = null;
    unassigned++;
  }

  // Intersected (river) catchment — a centroid lands in at most one.
  let cHit = null;
  for (const { c, box } of catchBoxes) {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    if (booleanPointInPolygon(center, c)) { cHit = c; break; }
  }
  farm.properties.catchment_id = cHit ? cHit.properties.catchment_id : null;
  farm.properties.catchment_name = cHit ? cHit.properties.name : null;
  if (!cHit) noCatchment++;
}
console.log(`assigned ${farms.length - unassigned}/${farms.length} farms to a district; ${unassigned} unassigned`);
console.log(`assigned ${farms.length - noCatchment}/${farms.length} farms to a river catchment; ${noCatchment} without`);

// --- 3. Build dropdown index ---
const distinct = (key) =>
  [...new Set(catchmentsFC.features.map((c) => c.properties[key]))].sort();

const districts = [...districtCount.entries()]
  .map(([river_basin_district, farm_count]) => ({ river_basin_district, farm_count }))
  .sort((a, b) => a.river_basin_district.localeCompare(b.river_basin_district));

const index = {
  water_body_types: distinct('water_body_type'),
  river_basin_districts: distinct('river_basin_district'),
  districts, // districts that contain >=1 farm (for the farm filter dropdown)
};

// --- 4. Write outputs ---
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'farms-by-district.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: farms }),
);
fs.writeFileSync(path.join(OUT, 'filters-index.json'), JSON.stringify(index, null, 2));
console.log(`wrote data/farms-by-district.geojson and data/filters-index.json (${districts.length} districts with farms)`);

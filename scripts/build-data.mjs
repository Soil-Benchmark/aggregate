// Build the static artifacts the app loads at runtime, derived from the raw
// source geojson in public/. Run: `node scripts/build-data.mjs`
//
// Inputs  (full fidelity, NOT shipped to the browser):
//   public/farms.geojson        farm polygons
//   public/catchments.geojson   4,773 catchment MultiPolygons (23 MB)
//
// Outputs (small, shipped to the browser — written to public/data/):
//   farms.geojson               farms deduped + catchment_id/name baked on
//   catchments-index.json       dropdown options (filter values + catchment list)
//
// The simplified catchment geometry for *display* is produced separately by
// mapshaper (see package.json "build:data"). Assignment here uses the
// FULL-precision catchments so farms near a boundary aren't misassigned.

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
const catchmentsFC = load('catchments.geojson');

// --- 1. Dedupe farms (source has geometrically-identical duplicate features) ---
const seen = new Set();
const farms = farmsFC.features.filter((f) => {
  if (seen.has(f.properties.id)) return false;
  seen.add(f.properties.id);
  return true;
});
console.log(`farms: ${farmsFC.features.length} features -> ${farms.length} unique`);

// --- 2. Assign each farm to a catchment (centroid point-in-polygon) ---
// Precompute catchment bboxes once; prune by bbox before the expensive test.
const boxes = catchmentsFC.features.map((c) => ({ c, box: bbox(c) }));
const farmCount = new Map(); // catchment_id -> number of farms
let unassigned = 0;

for (const farm of farms) {
  const center = centroid(farm);
  const [x, y] = center.geometry.coordinates;
  let hit = null;
  for (const { c, box } of boxes) {
    if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
    if (booleanPointInPolygon(center, c)) { hit = c; break; }
  }
  if (hit) {
    farm.properties.catchment_id = hit.properties.catchment_id;
    farm.properties.catchment_name = hit.properties.name;
    farmCount.set(hit.properties.catchment_id, (farmCount.get(hit.properties.catchment_id) || 0) + 1);
  } else {
    farm.properties.catchment_id = null;
    farm.properties.catchment_name = null;
    unassigned++;
  }
}
console.log(`assigned ${farms.length - unassigned}/${farms.length} farms; ${unassigned} unassigned`);

// --- 3. Build dropdown index ---
const distinct = (key) =>
  [...new Set(catchmentsFC.features.map((c) => c.properties[key]))].sort();

const catchments = catchmentsFC.features
  .filter((c) => farmCount.has(c.properties.catchment_id))
  .map((c) => ({
    catchment_id: c.properties.catchment_id,
    name: c.properties.name,
    farm_count: farmCount.get(c.properties.catchment_id),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const index = {
  water_body_types: distinct('water_body_type'),
  river_basin_districts: distinct('river_basin_district'),
  catchments, // only those containing >=1 farm (for the farm filter dropdown)
};

// --- 4. Write outputs ---
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'farms.geojson'),
  JSON.stringify({ type: 'FeatureCollection', features: farms }),
);
fs.writeFileSync(path.join(OUT, 'catchments-index.json'), JSON.stringify(index, null, 2));
console.log(`wrote data/farms.geojson and data/catchments-index.json (${catchments.length} catchments with farms)`);

// One-off: re-bake each seed farm's `river_basin_district` to the EA Management
// Catchment its land falls in (replacing the old, coarse RBD values). Keeps the
// search filter + group tags consistent with the new basin layer.
import { readFileSync, writeFileSync } from 'node:fs';
import centroid from '@turf/centroid';
import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanIntersects from '@turf/boolean-intersects';

const seedPath = new URL('../public/data/seed-live.json', import.meta.url);
const districtsPath = new URL('../public/data/districts.geojson', import.meta.url);

const seed = JSON.parse(readFileSync(seedPath));
const districts = JSON.parse(readFileSync(districtsPath));

const cats = districts.features
  .filter((f) => f.geometry)
  .map((f) => ({ name: f.properties.river_basin_district, box: bbox(f), feature: f }));

let baked = 0;
let missed = 0;
for (const farm of seed.farms ?? []) {
  const c = centroid(farm);
  const [cx, cy] = c.geometry.coordinates;
  let hit = null;
  // Prefer the catchment whose polygon contains the farm centroid.
  for (const cat of cats) {
    const [minX, minY, maxX, maxY] = cat.box;
    if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;
    if (booleanPointInPolygon(c, cat.feature)) { hit = cat; break; }
  }
  // Fallback: any catchment the farm geometry intersects.
  if (!hit) {
    const fb = bbox(farm);
    for (const cat of cats) {
      const [minX, minY, maxX, maxY] = cat.box;
      if (fb[2] < minX || fb[0] > maxX || fb[3] < minY || fb[1] > maxY) continue;
      if (booleanIntersects(farm, cat.feature)) { hit = cat; break; }
    }
  }
  farm.properties.river_basin_district = hit ? hit.name : null;
  if (hit) baked++; else missed++;
}

writeFileSync(seedPath, JSON.stringify(seed));
console.log(`baked ${baked} farms, ${missed} with no management catchment (likely Scotland/Wales or coastal)`);

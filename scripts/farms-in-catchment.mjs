// Given a catchment id, return the farms that fall inside it.
//
// Reduction in use (for now): a farm is "inside" a catchment if the farm's
// *centroid* is inside the catchment polygon. Farms are stored as real
// polygons (geographic area), so to upgrade to true overlap later, swap the
// `booleanPointInPolygon(center, catchment)` line for
// `booleanIntersects(farm, catchment)` — nothing else changes.
//
// The functions below are environment-agnostic (no Node APIs), so the same
// logic can be lifted into the browser app. Only the CLI section at the bottom
// touches the filesystem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { centroid } from '@turf/centroid';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { bbox } from '@turf/bbox';

/**
 * Precompute each farm's centroid once. Returns [{ farm, center }].
 * Do this a single time, not per query.
 */
export function indexFarms(farmsFC) {
  return farmsFC.features.map((farm) => ({ farm, center: centroid(farm) }));
}

/** Find a catchment feature by its string `catchment_id` or numeric `id`. */
export function findCatchment(catchmentsFC, catchmentId) {
  const wanted = String(catchmentId);
  return catchmentsFC.features.find(
    (c) =>
      c.properties.catchment_id === catchmentId ||
      String(c.properties.id) === wanted,
  );
}

/**
 * Return the farm features whose centroid falls inside the given catchment.
 * `farmsIndex` is the output of indexFarms().
 */
export function farmsInCatchment(catchmentId, { farmsIndex, catchmentsFC }) {
  const catchment = findCatchment(catchmentsFC, catchmentId);
  if (!catchment) throw new Error(`No catchment found for id "${catchmentId}"`);

  // Cheap bbox reject before the expensive point-in-polygon test. Catchment
  // polygons are complex MultiPolygons, so pruning by bounding box first is a
  // big win when most farms are nowhere near this catchment.
  const [minX, minY, maxX, maxY] = bbox(catchment);
  const inBox = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  return farmsIndex
    .filter(({ center }) => inBox(center.geometry.coordinates))
    .filter(({ center }) => booleanPointInPolygon(center, catchment))
    .map(({ farm }) => farm);
}

// ---------------------------------------------------------------------------
// CLI: `node scripts/farms-in-catchment.mjs <catchmentId>`
//   - with an id  -> prints the farms inside that catchment
//   - without one -> scans for catchments that actually contain farms, so you
//                    have a real id to try
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const PUBLIC = path.join(__dirname, '..', 'public');
  const load = (name) =>
    JSON.parse(fs.readFileSync(path.join(PUBLIC, name), 'utf8'));

  const farmsFC = load('farms.geojson');
  const catchmentsFC = load('catchments.geojson');
  const farmsIndex = indexFarms(farmsFC);
  const id = process.argv[2];

  if (id) {
    const matches = farmsInCatchment(id, { farmsIndex, catchmentsFC });
    console.log(`${matches.length} farm(s) inside catchment "${id}":`);
    for (const f of matches) {
      console.log(`  ${f.properties.id}  (${f.properties.postcode})`);
    }
  } else {
    // Discovery: assign each farm to a catchment so we can suggest ids.
    // bbox-prune every catchment per farm, then point-in-polygon the survivors.
    const boxes = catchmentsFC.features.map((c) => ({ c, box: bbox(c) }));
    const counts = new Map();
    for (const { center } of farmsIndex) {
      const [x, y] = center.geometry.coordinates;
      for (const { c, box } of boxes) {
        if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
        if (booleanPointInPolygon(center, c)) {
          const key = c.properties.catchment_id;
          counts.set(key, (counts.get(key) || 0) + 1);
          break; // a centroid lands in at most one catchment
        }
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    const assigned = [...counts.values()].reduce((a, b) => a + b, 0);
    console.log(
      `Assigned ${assigned}/${farmsIndex.length} farms across ${counts.size} catchments.`,
    );
    console.log('Top catchments by farm count (use one of these ids):');
    for (const [cid, n] of top) {
      const name = findCatchment(catchmentsFC, cid)?.properties.name ?? '';
      console.log(`  ${n.toString().padStart(3)}  ${cid}  ${name}`);
    }
  }
}

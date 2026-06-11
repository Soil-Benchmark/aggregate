import fs from 'node:fs';
import path from 'node:path';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { bbox } from '@turf/bbox';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

// Server-side: given a point, find its river basin district and (river)
// catchment by point-in-polygon — the same reduction the build pipeline uses,
// so user-added farms get the same context as the seed data. Reads the
// FULL-precision source geojson from /public and caches it across requests.

type DistrictProps = { river_basin_district: string };
type CatchmentProps = {
  catchment_id: string;
  name: string;
  water_body_type: string;
  river_basin_district: string;
};
type Boxed<P> = { feature: Feature<Polygon | MultiPolygon, P>; box: number[] };

let cache: { districts: Boxed<DistrictProps>[]; catchments: Boxed<CatchmentProps>[] } | null =
  null;

const load = () => {
  if (cache) return cache;
  const read = (rel: string) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));

  const districtsFC = read('public/data/districts.geojson');
  const catchmentsFC = read('public/data/catchments.geojson');

  cache = {
    districts: districtsFC.features.map((feature: Feature<Polygon | MultiPolygon, DistrictProps>) => ({
      feature,
      box: bbox(feature),
    })),
    catchments: catchmentsFC.features
      .filter((c: Feature<Polygon | MultiPolygon, CatchmentProps>) => c.properties.water_body_type === 'River')
      .map((feature: Feature<Polygon | MultiPolygon, CatchmentProps>) => ({
        feature,
        box: bbox(feature),
      })),
  };
  return cache;
};

export type LocateResult = {
  river_basin_district: string | null;
  catchment_id: string | null;
  catchment_name: string | null;
};

export const locatePoint = (lng: number, lat: number): LocateResult => {
  const { districts, catchments } = load();
  const pt: [number, number] = [lng, lat];
  const inBox = (box: number[]) =>
    lng >= box[0] && lng <= box[2] && lat >= box[1] && lat <= box[3];

  let river_basin_district: string | null = null;
  for (const { feature, box } of districts) {
    if (!inBox(box)) continue;
    if (booleanPointInPolygon(pt, feature)) {
      river_basin_district = feature.properties.river_basin_district;
      break;
    }
  }

  let catchment_id: string | null = null;
  let catchment_name: string | null = null;
  for (const { feature, box } of catchments) {
    if (!inBox(box)) continue;
    if (booleanPointInPolygon(pt, feature)) {
      catchment_id = feature.properties.catchment_id;
      catchment_name = feature.properties.name;
      break;
    }
  }

  return { river_basin_district, catchment_id, catchment_name };
};

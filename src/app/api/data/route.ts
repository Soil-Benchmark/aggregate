import { NextResponse } from 'next/server';
import { centroid } from '@turf/centroid';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import {
  ADDED_FARMS_OBJECT,
  GROUPS_OBJECT,
  RAW_FARMS_OBJECT,
  gcsConfigured,
  readJson,
  readJsonArray,
} from '@/lib/gcs';
import { locatePoint } from '@/lib/locate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FarmFeature = Feature<Polygon, Record<string, unknown>>;

// Enriching the base farms (centroid → district/catchment) is deterministic and
// the raw file is immutable per deploy, so compute once and cache in memory.
let enrichedCache: { count: number; features: FarmFeature[] } | null = null;

const enrich = (features: FarmFeature[]): FarmFeature[] =>
  features.map((f) => {
    const [lng, lat] = centroid(f).geometry.coordinates;
    const { river_basin_district, catchment_id, catchment_name } = locatePoint(lng, lat);
    return {
      ...f,
      properties: { ...f.properties, river_basin_district, catchment_id, catchment_name },
    };
  });

// Returns the live dataset: base groups (+ user-added) and base farms enriched
// on the fly (+ user-added farms). GCS is required.
export async function GET() {
  if (!gcsConfigured()) {
    return NextResponse.json(
      { error: 'Storage is not configured (set GCS_BUCKET).' },
      { status: 503 },
    );
  }
  try {
    const [groups, rawFC, added] = await Promise.all([
      readJsonArray(GROUPS_OBJECT),
      readJson<FeatureCollection<Polygon, Record<string, unknown>>>(RAW_FARMS_OBJECT),
      readJsonArray<FarmFeature>(ADDED_FARMS_OBJECT),
    ]);

    const rawFeatures = rawFC?.features ?? [];
    if (!enrichedCache || enrichedCache.count !== rawFeatures.length) {
      enrichedCache = { count: rawFeatures.length, features: enrich(rawFeatures) };
    }

    return NextResponse.json({
      groups,
      farms: [...enrichedCache.features, ...added],
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to read stored data', detail: String(err), groups: [], farms: [] },
      { status: 500 },
    );
  }
}

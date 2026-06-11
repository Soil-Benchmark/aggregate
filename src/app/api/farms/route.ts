import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import buffer from '@turf/buffer';
import type { Feature, Point } from 'geojson';
import { ADDED_FARMS_OBJECT, appendJson, gcsConfigured } from '@/lib/gcs';
import { locatePoint } from '@/lib/locate';

export const runtime = 'nodejs';

type FarmBody = {
  groupId?: string;
  lng?: number;
  lat?: number;
  hectares?: number;
  postcode?: string;
  address?: string;
};

export async function POST(req: Request) {
  if (!gcsConfigured()) {
    return NextResponse.json(
      { error: 'Storage is not configured yet (set GCS_BUCKET).' },
      { status: 503 },
    );
  }

  let body: FarmBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { groupId, lng, lat, hectares } = body;
  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
  }
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return NextResponse.json(
      { error: 'lng and lat must be numbers (geocode the address first)' },
      { status: 400 },
    );
  }
  if (typeof hectares !== 'number' || !(hectares > 0)) {
    return NextResponse.json(
      { error: 'hectares must be a positive number' },
      { status: 400 },
    );
  }

  // District + catchment are derived from the centroid, on the fly.
  const located = locatePoint(lng, lat);

  // Build the farm geometry from the centroid + area: a circle whose area
  // equals the stated hectares. radius = sqrt(area_m2 / π). Mirrors the PostGIS
  // seed (ST_Buffer in metres on a projected point), done here with turf.
  const point: Feature<Point> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lng, lat] },
  };
  const radiusMetres = Math.sqrt((hectares * 10000) / Math.PI);
  const circle = buffer(point, radiusMetres, { units: 'meters', steps: 24 });
  if (!circle) {
    return NextResponse.json(
      { error: 'Failed to compute farm geometry' },
      { status: 500 },
    );
  }

  // Stored in the same shape as the seed farms (GeoJSON Feature<Polygon>).
  const farm: Feature = {
    type: 'Feature',
    geometry: circle.geometry,
    properties: {
      id: randomUUID(),
      group_id: groupId,
      hectares,
      postcode: body.postcode?.trim() ?? '',
      address: body.address?.trim() ?? '',
      ...located,
    },
  };

  try {
    await appendJson(ADDED_FARMS_OBJECT, farm);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save farm', detail: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ farm }, { status: 201 });
}

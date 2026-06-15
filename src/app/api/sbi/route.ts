import { NextResponse } from 'next/server';

// Read-only proxy to the public DEFRA / RPA "LandCovers" WFS — resolves an
// England SBI to its field-parcel geometry (GeoJSON, WGS84). No auth needed,
// and this never touches our own storage. Mirrors how Soil Benchmark's
// `add_farm` (regolith) sources boundaries by SBI.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sbi = (searchParams.get('sbi') ?? '').trim();

  if (!/^\d{6,12}$/.test(sbi)) {
    return NextResponse.json({ error: 'Invalid SBI (expect 6–12 digits)' }, { status: 400 });
  }

  const url =
    'https://environment.data.gov.uk/data-services/RPA/LandCovers/wfs' +
    '?version=2.0.0&request=GetFeature&typeNames=RPA:LandCovers' +
    `&cql_filter=SBI=${sbi}&srsname=EPSG:4326&outputFormat=application/json`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `RPA LandCovers WFS returned ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Failed to reach RPA WFS: ${e}` }, { status: 502 });
  }
}

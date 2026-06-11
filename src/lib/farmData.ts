import type { Feature, FeatureCollection, Polygon } from 'geojson';

export type Label = {
  label: string;
  color: string;
};

export type FarmGroup = {
  groupId: string;
  name: string;
  description: string;
  contactName: string;
  contactEmail: string;
  labels: string[];
};

export type FarmProperties = {
  id: string;
  postcode: string;
  group_id: string;
  river_basin_district: string | null;
  catchment_id: string | null;
  catchment_name: string | null;
};

export type FarmFeature = Feature<Polygon, FarmProperties>;
export type FarmsGeoJSON = FeatureCollection<Polygon, FarmProperties>;

export type FarmData = {
  groups: FarmGroup[];
  farms: FarmsGeoJSON;
  labels: Label[];
  districts: string[];
};

type DistrictsFC = {
  features: { properties: { river_basin_district?: string } }[];
};

const json = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
};

/**
 * Loads farm geometry (GeoJSON) and group metadata (JSON). Labels now live on
 * each group (`group.labels`); `labels.json` is just the name→colour palette.
 * Runs in the browser.
 */
type StoredData = { groups?: FarmGroup[]; farms?: FarmFeature[]; error?: string };

/**
 * The live dataset (groups + farms) is served from GCS via /api/data — GCS is
 * required, there is no static fallback. The label palette and the river basin
 * district list (derived from districts.geojson) are static reference data.
 */
export const loadFarmData = async (): Promise<FarmData> => {
  const [labels, districtsFC, res] = await Promise.all([
    json<Label[]>('/data/labels.json'),
    json<DistrictsFC>('/data/districts.geojson'),
    fetch('/api/data'),
  ]);

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as StoredData;
    throw new Error(body.error ?? `Failed to load data (${res.status})`);
  }
  const stored = (await res.json()) as StoredData;

  const groups: FarmGroup[] = (stored.groups ?? []).map((g) => ({
    ...g,
    labels: g.labels ?? [],
  }));

  const districts = [
    ...new Set(
      districtsFC.features
        .map((f) => f.properties.river_basin_district)
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();

  return {
    groups,
    farms: { type: 'FeatureCollection', features: stored.farms ?? [] },
    labels,
    districts,
  };
};

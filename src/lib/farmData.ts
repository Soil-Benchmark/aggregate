import type { FeatureCollection, Polygon } from 'geojson';

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
};

export type FarmsGeoJSON = FeatureCollection<Polygon, FarmProperties>;

export type FarmData = {
  groups: FarmGroup[];
  farms: FarmsGeoJSON;
  labels: Label[];
};

type RawGroup = Omit<FarmGroup, 'labels'>;
type RawGroupLabel = { groupId: string; label: string };

const json = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
};

/**
 * Loads farm geometry (GeoJSON) and group/label metadata (JSON) from /public,
 * folding the group→label join into each group's `labels` array.
 * Runs in the browser.
 */
export const loadFarmData = async (): Promise<FarmData> => {
  const [farms, rawGroups, groupLabels, labels] = await Promise.all([
    json<FarmsGeoJSON>('/data/farms-by-district.geojson'),
    json<RawGroup[]>('/data/farm_groups.json'),
    json<RawGroupLabel[]>('/data/group_labels.json'),
    json<Label[]>('/data/labels.json'),
  ]);

  const labelsByGroup = new Map<string, string[]>();
  for (const { groupId, label } of groupLabels) {
    const existing = labelsByGroup.get(groupId);
    if (existing) existing.push(label);
    else labelsByGroup.set(groupId, [label]);
  }

  const groups: FarmGroup[] = rawGroups.map((g) => ({
    ...g,
    labels: labelsByGroup.get(g.groupId) ?? [],
  }));

  return { groups, farms, labels };
};

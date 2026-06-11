import type { FarmGroup, FarmsGeoJSON } from './farmData';

/**
 * A single active search filter. Discriminated union so new filter kinds
 * (e.g. `catchment`, `location`) can be added without changing call sites.
 */
export type Filter =
  | { kind: 'label'; label: string }
  | { kind: 'name'; query: string };

/**
 * Returns the set of group ids that satisfy all active filters (combined with
 * AND). Label filters require a group to carry *every* selected label; the name
 * filter requires the group name to contain the query (case-insensitive). With
 * no filters, all groups match.
 */
export const matchingGroupIds = (
  groups: FarmGroup[],
  filters: Filter[],
): Set<string> => {
  const selectedLabels = filters
    .filter((f) => f.kind === 'label')
    .map((f) => f.label);

  const nameQuery =
    filters.find((f) => f.kind === 'name')?.query.trim().toLowerCase() ?? '';

  const matches = groups.filter(
    (g) =>
      selectedLabels.every((label) => g.labels.includes(label)) &&
      (nameQuery === '' || g.name.toLowerCase().includes(nameQuery)),
  );

  return new Set(matches.map((g) => g.groupId));
};

/** Keeps only farms whose group is in `groupIds`. */
export const filterFarms = (
  farms: FarmsGeoJSON,
  groupIds: Set<string>,
): FarmsGeoJSON => ({
  type: 'FeatureCollection',
  features: farms.features.filter((f) => groupIds.has(f.properties.group_id)),
});

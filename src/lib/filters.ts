import type { FarmGroup, FarmsGeoJSON } from './farmData';

/**
 * A single active search filter. Discriminated union so new filter kinds
 * (e.g. `catchment`, `location`) can be added without changing call sites.
 */
export type Filter = { kind: 'label'; label: string };

/**
 * Returns the set of group ids that satisfy all active filters.
 * Label filters are combined with AND: a group must carry *every* selected
 * label. With no filters, all groups match.
 */
export const matchingGroupIds = (
  groups: FarmGroup[],
  filters: Filter[],
): Set<string> => {
  const selectedLabels = filters
    .filter((f) => f.kind === 'label')
    .map((f) => f.label);

  const matches = groups.filter((g) =>
    selectedLabels.every((label) => g.labels.includes(label)),
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

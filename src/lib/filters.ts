import type { FarmGroup, FarmsGeoJSON } from './farmData';

/**
 * A single active search filter. Discriminated union so new filter kinds
 * (e.g. `location`) can be added without changing call sites.
 */
export type Filter =
  | { kind: 'label'; label: string }
  | { kind: 'name'; query: string }
  | { kind: 'catchment'; district: string };

/**
 * Returns the set of group ids that satisfy the group-level filters (combined
 * with AND). Label filters require a group to carry *every* selected label; the
 * name filter requires the group name to contain the query (case-insensitive).
 * With no such filters, all groups match.
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

/**
 * Resolves the set of farms to show. Group-level filters (label, name) are
 * combined with AND; the catchment filter keeps farms in ANY of the selected
 * river basin districts (OR). Categories combine with AND.
 */
export const applyFilters = (
  farms: FarmsGeoJSON,
  groups: FarmGroup[],
  filters: Filter[],
): FarmsGeoJSON => {
  const groupIds = matchingGroupIds(groups, filters);
  const districts = filters.flatMap((f) =>
    f.kind === 'catchment' ? [f.district] : [],
  );

  return {
    type: 'FeatureCollection',
    features: farms.features.filter(
      (f) =>
        groupIds.has(f.properties.group_id) &&
        (districts.length === 0 ||
          (f.properties.river_basin_district !== null &&
            districts.includes(f.properties.river_basin_district))),
    ),
  };
};

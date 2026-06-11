'use client';

import { useEffect, useMemo, useState } from 'react';
import { Map } from './Map';
import { SearchBar } from './SearchBar';
import { loadFarmData, type FarmData } from '@/lib/farmData';
import { filterFarms, matchingGroupIds, type Filter } from '@/lib/filters';

const EMPTY_DATA: FarmData = {
  groups: [],
  farms: { type: 'FeatureCollection', features: [] },
  labels: [],
};

export const MapView = () => {
  const [data, setData] = useState<FarmData>(EMPTY_DATA);
  const [filters, setFilters] = useState<Filter[]>([]);

  useEffect(() => {
    let active = true;
    loadFarmData()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => console.error('Failed to load farm data', err));
    return () => {
      active = false;
    };
  }, []);

  const visibleFarms = useMemo(
    () => filterFarms(data.farms, matchingGroupIds(data.groups, filters)),
    [data, filters],
  );

  return (
    <>
      <Map farms={visibleFarms} groups={data.groups} labels={data.labels} />
      <SearchBar labels={data.labels} filters={filters} onChange={setFilters} />
    </>
  );
};

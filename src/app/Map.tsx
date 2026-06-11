'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  FilterIndex,
  WATER_BODY_COLORS,
  WATER_BODY_FALLBACK,
} from './catchmentFilters';
import { FilterPanel } from './FilterPanel';

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

// Mapbox match expression: water_body_type -> colour.
const waterBodyColor = [
  'match',
  ['get', 'water_body_type'],
  ...Object.entries(WATER_BODY_COLORS).flatMap(([type, color]) => [type, color]),
  WATER_BODY_FALLBACK,
] as mapboxgl.ExpressionSpecification;

export const Map = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [index, setIndex] = useState<FilterIndex | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Catchment-display filters: OR within each list, AND across the two.
  const [waterBodyTypes, setWaterBodyTypes] = useState<string[]>([]);
  const [riverBasinDistricts, setRiverBasinDistricts] = useState<string[]>([]);
  // Farm filter: show farms in ANY of the selected catchments.
  const [catchments, setCatchments] = useState<string[]>([]);

  // Create the map, load data, add the two filtered layers.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [farms, catchmentsData, idx] = await Promise.all([
        fetch('/data/farms-by-catchment.geojson').then((r) => r.json()),
        fetch('/data/catchments.simplified.geojson').then((r) => r.json()),
        fetch('/data/catchments-index.json').then((r) => r.json()),
      ]);
      if (cancelled || !mapContainer.current || mapRef.current) return;

      setIndex(idx);
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        antialias: true,
      });
      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mapContainer.current);
      map.once('remove', () => resizeObserver.disconnect());

      map.on('load', () => {
        map.addSource('catchments', { type: 'geojson', data: catchmentsData });
        map.addLayer({
          id: 'catchments-fill',
          type: 'fill',
          source: 'catchments',
          paint: { 'fill-color': waterBodyColor, 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: 'catchments-line',
          type: 'line',
          source: 'catchments',
          paint: { 'line-color': waterBodyColor, 'line-width': 0.8 },
        });

        map.addSource('farms', { type: 'geojson', data: farms });
        map.addLayer({
          id: 'farms-fill',
          type: 'fill',
          source: 'farms',
          paint: { 'fill-color': '#f97316', 'fill-opacity': 0.7 },
        });
        map.addLayer({
          id: 'farms-line',
          type: 'line',
          source: 'farms',
          paint: { 'line-color': '#c2410c', 'line-width': 1 },
        });

        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Apply filters whenever a selection changes (and once the map is ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const catchExpr: unknown[] = ['all'];
    if (waterBodyTypes.length)
      catchExpr.push(['in', ['get', 'water_body_type'], ['literal', waterBodyTypes]]);
    if (riverBasinDistricts.length)
      catchExpr.push(['in', ['get', 'river_basin_district'], ['literal', riverBasinDistricts]]);
    const catchmentFilter = (catchExpr.length > 1 ? catchExpr : null) as mapboxgl.FilterSpecification | null;
    map.setFilter('catchments-fill', catchmentFilter);
    map.setFilter('catchments-line', catchmentFilter);

    const farmFilter = (catchments.length
      ? ['in', ['get', 'catchment_id'], ['literal', catchments]]
      : null) as mapboxgl.FilterSpecification | null;
    map.setFilter('farms-fill', farmFilter);
    map.setFilter('farms-line', farmFilter);
  }, [mapReady, waterBodyTypes, riverBasinDistricts, catchments]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <FilterPanel
        index={index}
        waterBodyTypes={waterBodyTypes}
        setWaterBodyTypes={setWaterBodyTypes}
        riverBasinDistricts={riverBasinDistricts}
        setRiverBasinDistricts={setRiverBasinDistricts}
        catchments={catchments}
        setCatchments={setCatchments}
      />
    </div>
  );
};

'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WATER_BODY_COLORS, WATER_BODY_FALLBACK } from './catchmentFilters';
import type { FarmGroup, FarmsGeoJSON } from '@/lib/farmData';

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

// Mapbox match expression: water_body_type -> colour.
const waterBodyColor = [
  'match',
  ['get', 'water_body_type'],
  ...Object.entries(WATER_BODY_COLORS).flatMap(([type, color]) => [type, color]),
  WATER_BODY_FALLBACK,
] as mapboxgl.ExpressionSpecification;

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );

type MapProps = {
  farms: FarmsGeoJSON;
  groups: FarmGroup[];
};

export const Map = ({ farms, groups }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const farmsRef = useRef<FarmsGeoJSON>(farms);
  const groupsRef = useRef<FarmGroup[]>(groups);

  // Keep the latest data in refs so the one-time `load`/click handlers can read it.
  useEffect(() => {
    farmsRef.current = farms;
    groupsRef.current = groups;
  });

  // Create the map, load the catchment layers, and add the (prop-supplied) farms.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const catchmentsData = await fetch(
        '/data/catchments.simplified.geojson',
      ).then((r) => r.json());
      if (cancelled || !mapContainer.current || mapRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        antialias: true,
      });
      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mapContainer.current);
      map.once('remove', () => resizeObserver.disconnect());

      map.on('load', () => {
        // Catchments underneath, coloured by water body type. Hidden for now —
        // a future layers panel can flip `visibility` to 'visible' to toggle them.
        map.addSource('catchments', { type: 'geojson', data: catchmentsData });
        map.addLayer({
          id: 'catchments-fill',
          type: 'fill',
          source: 'catchments',
          layout: { visibility: 'none' },
          paint: { 'fill-color': waterBodyColor, 'fill-opacity': 0.3 },
        });
        map.addLayer({
          id: 'catchments-line',
          type: 'line',
          source: 'catchments',
          layout: { visibility: 'none' },
          paint: { 'line-color': waterBodyColor, 'line-width': 0.8 },
        });

        // Farms on top (data comes from props; updated via setData below).
        map.addSource('farms', { type: 'geojson', data: farmsRef.current });
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

        loadedRef.current = true;

        // Clicking a farm shows its group's contact details.
        map.on('click', 'farms-fill', (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties as { postcode?: string; group_id?: string };
          const group = groupsRef.current.find((g) => g.groupId === props.group_id);
          const html = `
            <div style="font-family: sans-serif; font-size: 13px; line-height: 1.4;">
              <strong>${escapeHtml(group?.name ?? 'Unknown group')}</strong><br/>
              ${props.postcode ? `${escapeHtml(props.postcode)}<br/>` : ''}
              ${group?.contactName ? `${escapeHtml(group.contactName)}<br/>` : ''}
              ${group?.contactEmail ? `<a href="mailto:${escapeHtml(group.contactEmail)}">${escapeHtml(group.contactEmail)}</a>` : ''}
            </div>`;
          new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
        });

        map.on('mouseenter', 'farms-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'farms-fill', () => {
          map.getCanvas().style.cursor = '';
        });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Push filtered farms (from the search bar) to the map whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource('farms') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(farms);
  }, [farms]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1.5 rounded-xl bg-white/80 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
        <span className="self-start text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Powered by
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sb-logo.png" alt="SoilBenchmark" className="h-8 w-auto" />
      </div>
    </div>
  );
};

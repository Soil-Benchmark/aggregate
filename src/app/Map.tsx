'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FarmGroup, FarmsGeoJSON } from '@/lib/farmData';

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

const SOURCE_ID = 'farms';
const FILL_LAYER_ID = 'farms-fill';
const LINE_LAYER_ID = 'farms-outline';

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

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      antialias: true,
    });

    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: farmsRef.current });

      map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': '#54A6BB',
          'fill-opacity': 0.35,
        },
      });

      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-width': 1.5,
          'line-opacity': 0.9,
        },
      });

      loadedRef.current = true;

      map.on('click', FILL_LAYER_ID, (e) => {
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

      map.on('mouseenter', FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Push filtered farms to the map whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(farms);
  }, [farms]);

  return <div ref={mapContainer} className="w-full h-full" />;
};

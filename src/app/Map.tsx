"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Waves, X } from "lucide-react";
import { WATER_BODY_COLORS, WATER_BODY_FALLBACK } from "./catchmentFilters";
import type { FarmGroup, FarmsGeoJSON, Label } from "@/lib/farmData";
import { Badge } from "@/components/ui/badge";
import { readableText } from "@/lib/utils";

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

const FILL_LAYER_ID = "farms-fill";
const LINE_LAYER_ID = "farms-line";

// Hover-highlight layers: hovering a chip in the details card outlines that
// area on the map. One entry per boundary source + the field to match on.
const HIGHLIGHT_LAYERS = [
  { id: "hl-catchments", source: "catchments", field: "catchment_id" },
  { id: "hl-districts", source: "districts", field: "river_basin_district" },
  { id: "hl-counties", source: "counties", field: "CTYUA23NM" },
  { id: "hl-la", source: "local-authorities", field: "LAD24NM" },
  { id: "hl-constituencies", source: "constituencies", field: "PCON24NM" },
  { id: "hl-sssi", source: "sssi", field: "NAME" },
  { id: "hl-pl", source: "protected-landscapes", field: "name" },
  { id: "hl-nvz", source: "nvz", field: "name" },
] as const;

// Fallback farm fill (used before groups load / for unknown groups).
const FARM_FILL = "#ff7a00";
// Dark outline so adjacent cluster fills stay visually separated.
const FARM_LINE = "#1f2937";

// Distinct colours so each cluster is its own colour on the map. Cycled if
// there are more clusters than colours.
const CLUSTER_PALETTE = [
  "#e6194B", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4",
  "#f032e6", "#469990", "#9A6324", "#800000", "#808000", "#000075",
  "#e6840b", "#1b9e77", "#d81b60", "#5e35b1", "#00897b", "#c0ca33",
];

// Build a Mapbox "match" expression: group_id -> cluster colour.
const farmColorExpression = (
  groupIds: string[],
): mapboxgl.ExpressionSpecification | string => {
  if (groupIds.length === 0) return FARM_FILL;
  const pairs = groupIds.flatMap((id, i) => [
    id,
    CLUSTER_PALETTE[i % CLUSTER_PALETTE.length],
  ]);
  return [
    "match",
    ["get", "group_id"],
    ...pairs,
    FARM_FILL,
  ] as mapboxgl.ExpressionSpecification;
};

// Protected landscapes: National Parks (green) vs National Landscapes / AONBs
// (olive) — both greens (designation family), distinct from each other.
const protectedColor = [
  "match",
  ["get", "kind"],
  "national_park",
  "#166534",
  "national_landscape",
  "#4d7c0f",
  "#166534",
] as mapboxgl.ExpressionSpecification;

// Mapbox match expression: water_body_type -> colour.
const waterBodyColor = [
  "match",
  ["get", "water_body_type"],
  ...Object.entries(WATER_BODY_COLORS).flatMap(([type, color]) => [type, color]),
  WATER_BODY_FALLBACK,
] as mapboxgl.ExpressionSpecification;

// Walk every [lng, lat] position in a Polygon OR MultiPolygon coordinate array
// (so bounds work for both — SBI/shapefile farms are MultiPolygons).
const eachPosition = (
  coords: unknown,
  cb: (pos: [number, number]) => void,
): void => {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    cb(coords as [number, number]);
    return;
  }
  if (Array.isArray(coords)) for (const c of coords) eachPosition(c, cb);
};

export type LayerVisibility = {
  catchments: boolean;
  basins: boolean;
  rivers: boolean;
  counties: boolean;
  localAuthorities: boolean;
  constituencies: boolean;
  sssi: boolean;
  protectedLandscapes: boolean;
  nvz: boolean;
};

export type GroupStats = {
  farmCount: number;
  areaHa: number;
  districts: string[];
  catchments: { id: string; name: string }[];
  counties: string[];
  localAuthorities: string[];
  constituencies: string[];
  sssi: string[];
  protectedLandscapes: string[];
  nvz: string[];
};

type MapProps = {
  farms: FarmsGeoJSON;
  groups: FarmGroup[];
  labels: Label[];
  layers: LayerVisibility;
  groupStats: Record<string, GroupStats>;
  activeDistricts: string[];
  basemap: "standard" | "satellite";
  canEdit?: boolean;
  onRemoveGroup?: (groupId: string) => void;
  onMapReady?: (map: mapboxgl.Map) => void;
};

export const Map = ({
  farms,
  groups,
  labels,
  layers,
  groupStats,
  activeDistricts,
  basemap,
  canEdit,
  onRemoveGroup,
  onMapReady,
}: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const didFitRef = useRef(false);
  const farmsRef = useRef<FarmsGeoJSON>(farms);
  const groupsRef = useRef<FarmGroup[]>(groups);
  const [selectedGroup, setSelectedGroup] = useState<FarmGroup | null>(null);
  // Fade the map in once it has actually painted, to avoid a blank/white flash.
  const [visible, setVisible] = useState(false);
  // True once layers exist, so the visibility effect can toggle them.
  const [ready, setReady] = useState(false);

  // label name -> color, for tinting the panel tags like the search bar does.
  // (Plain object, not a Map — `Map` is this component's own name here.)
  const labelColors = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.label, l.color])),
    [labels]
  );

  // Reset the highlight paint + close the details panel.
  const clearSelection = useCallback(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) {
      // Keep the per-cluster fill colours; just restore uniform emphasis.
      map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", 0.8);
      map.setPaintProperty(LINE_LAYER_ID, "line-width", 0.8);
    }
    setSelectedGroup(null);
  }, []);

  // Hovering a chip in the details card outlines that area on the map.
  const highlightArea = useCallback((id: string, value: string) => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    for (const h of HIGHLIGHT_LAYERS) {
      const on = h.id === id;
      const filter = [
        "==",
        ["get", h.field],
        on ? value : "__none__",
      ] as mapboxgl.FilterSpecification;
      map.setFilter(`${h.id}-fill`, filter);
      map.setFilter(`${h.id}-line`, filter);
      const vis = on ? "visible" : "none";
      map.setLayoutProperty(`${h.id}-fill`, "visibility", vis);
      map.setLayoutProperty(`${h.id}-line`, "visibility", vis);
    }
  }, []);
  const clearHighlight = useCallback(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    for (const h of HIGHLIGHT_LAYERS) {
      map.setLayoutProperty(`${h.id}-fill`, "visibility", "none");
      map.setLayoutProperty(`${h.id}-line`, "visibility", "none");
    }
  }, []);

  // Keep the latest data in refs so the one-time `load`/click handlers can read it.
  useEffect(() => {
    farmsRef.current = farms;
    groupsRef.current = groups;
  });

  // Create the map, load the catchment layers, and add the (prop-supplied) farms.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [
        catchmentsData,
        districtsData,
        countiesData,
        laData,
        riversData,
        constituenciesData,
        sssiData,
        protectedData,
        nvzData,
      ] = await Promise.all([
        fetch("/data/catchments.geojson").then((r) => r.json()),
        fetch("/data/districts.geojson").then((r) => r.json()),
        fetch("/data/counties.geojson").then((r) => r.json()),
        fetch("/data/local-authorities.geojson").then((r) => r.json()),
        fetch("/data/rivers.geojson").then((r) => r.json()),
        fetch("/data/constituencies.geojson").then((r) => r.json()),
        fetch("/data/sssi.geojson").then((r) => r.json()),
        fetch("/data/protected-landscapes.geojson").then((r) => r.json()),
        fetch("/data/nvz.geojson").then((r) => r.json()),
      ]);
      if (cancelled || !mapContainer.current || mapRef.current) return;

      // Only load river catchments for now.
      catchmentsData.features = catchmentsData.features.filter(
        (f: { properties?: { water_body_type?: string } }) =>
          f.properties?.water_body_type === "River",
      );

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/standard",
        // Apply faded/dusk before the first paint to avoid a day-time flash.
        config: { basemap: { theme: "faded" } },
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        antialias: true,
      });
      mapRef.current = map;
      // Hand the map instance up so MapView can render the custom control bar.
      onMapReady?.(map);

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(mapContainer.current);
      map.once("remove", () => resizeObserver.disconnect());

      // Small label following the cursor with the hovered farm's group name.
      const hoverPopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
        className: "farm-hover-popup",
      });

      map.on("load", () => {
        // 3D terrain — so hills and valleys show when the map is pitched (3D),
        // like the main Soil Benchmark platform.
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.3 });

        // Catchments underneath, coloured by water body type. Hidden for now —
        // a future layers panel can flip `visibility` to 'visible' to toggle them.
        map.addSource("catchments", { type: "geojson", data: catchmentsData });
        map.addLayer({
          id: "catchments-fill",
          type: "fill",
          source: "catchments",
          layout: { visibility: "none" },
          paint: { "fill-color": waterBodyColor, "fill-opacity": 0.3 },
        });
        map.addLayer({
          id: "catchments-line",
          type: "line",
          source: "catchments",
          layout: { visibility: "none" },
          paint: { "line-color": waterBodyColor, "line-width": 0.8 },
        });

        // River basin districts — sky-toned to match the "river basin" filter
        // tag. Hidden until toggled in the layers panel.
        map.addSource("districts", { type: "geojson", data: districtsData });
        map.addLayer({
          id: "districts-fill",
          type: "fill",
          source: "districts",
          layout: { visibility: "none" },
          paint: { "fill-color": "#38bdf8", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: "districts-line",
          type: "line",
          source: "districts",
          layout: { visibility: "none" },
          paint: { "line-color": "#0ea5e9", "line-width": 1.2 },
        });

        // Administrative boundaries — counties (amber) and local authorities
        // (violet). Hidden until toggled in the layers panel.
        map.addSource("counties", { type: "geojson", data: countiesData });
        map.addLayer({
          id: "counties-fill",
          type: "fill",
          source: "counties",
          layout: { visibility: "none" },
          paint: { "fill-color": "#d97706", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "counties-line",
          type: "line",
          source: "counties",
          layout: { visibility: "none" },
          paint: { "line-color": "#b45309", "line-width": 1.4 },
        });

        map.addSource("local-authorities", { type: "geojson", data: laData });
        map.addLayer({
          id: "la-fill",
          type: "fill",
          source: "local-authorities",
          layout: { visibility: "none" },
          paint: { "fill-color": "#7c3aed", "fill-opacity": 0.05 },
        });
        map.addLayer({
          id: "la-line",
          type: "line",
          source: "local-authorities",
          layout: { visibility: "none" },
          paint: { "line-color": "#6d28d9", "line-width": 1 },
        });

        // Westminster parliamentary constituencies (rose). Hidden by default.
        map.addSource("constituencies", {
          type: "geojson",
          data: constituenciesData,
        });
        map.addLayer({
          id: "constituencies-fill",
          type: "fill",
          source: "constituencies",
          layout: { visibility: "none" },
          paint: { "fill-color": "#db2777", "fill-opacity": 0.05 },
        });
        map.addLayer({
          id: "constituencies-line",
          type: "line",
          source: "constituencies",
          layout: { visibility: "none" },
          paint: { "line-color": "#be185d", "line-width": 1 },
        });

        // SSSIs (green) — Sites of Special Scientific Interest. Hidden by default.
        map.addSource("sssi", { type: "geojson", data: sssiData });
        map.addLayer({
          id: "sssi-fill",
          type: "fill",
          source: "sssi",
          layout: { visibility: "none" },
          paint: { "fill-color": "#15803d", "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "sssi-line",
          type: "line",
          source: "sssi",
          layout: { visibility: "none" },
          paint: { "line-color": "#166534", "line-width": 1 },
        });

        // National Parks (green) & National Landscapes / AONBs (olive).
        // Hidden by default.
        map.addSource("protected-landscapes", {
          type: "geojson",
          data: protectedData,
        });
        map.addLayer({
          id: "pl-fill",
          type: "fill",
          source: "protected-landscapes",
          layout: { visibility: "none" },
          paint: { "fill-color": protectedColor, "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: "pl-line",
          type: "line",
          source: "protected-landscapes",
          layout: { visibility: "none" },
          paint: { "line-color": protectedColor, "line-width": 1.4 },
        });

        // Nitrate Vulnerable Zones (brick red), by type. Hidden by default.
        map.addSource("nvz", { type: "geojson", data: nvzData });
        map.addLayer({
          id: "nvz-fill",
          type: "fill",
          source: "nvz",
          layout: { visibility: "none" },
          paint: { "fill-color": "#dc2626", "fill-opacity": 0.16 },
        });
        map.addLayer({
          id: "nvz-line",
          type: "line",
          source: "nvz",
          layout: { visibility: "none" },
          paint: { "line-color": "#b91c1c", "line-width": 1 },
        });

        // Farms on top (data comes from props; updated via setData below).
        map.addSource("farms", { type: "geojson", data: farmsRef.current });
        map.addLayer({
          id: FILL_LAYER_ID,
          type: "fill",
          source: "farms",
          paint: { "fill-color": FARM_FILL, "fill-opacity": 0.8 },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: "farms",
          paint: { "line-color": FARM_LINE, "line-width": 0.8 },
        });

        // Satellite basemap, inserted just below the overlays so the farms /
        // catchments still sit on top. Hidden by default (Standard map); the
        // "map layers" control toggles it on for a satellite view.
        map.addSource("satellite", {
          type: "raster",
          url: "mapbox://mapbox.satellite",
          tileSize: 256,
        });
        map.addLayer(
          {
            id: "satellite-basemap",
            type: "raster",
            source: "satellite",
            layout: { visibility: "none" },
            paint: { "raster-opacity": 1 },
          },
          "catchments-fill",
        );

        // Major rivers (OS Open Rivers, named rivers > 35km). Drawn on top as a
        // highlight; hidden until toggled.
        map.addSource("rivers", { type: "geojson", data: riversData });
        map.addLayer({
          id: "rivers-line",
          type: "line",
          source: "rivers",
          layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#1d4ed8", "line-width": 2.4, "line-opacity": 0.95 },
        });

        // Hover-highlight layers (match nothing + hidden until a chip is hovered).
        for (const h of HIGHLIGHT_LAYERS) {
          map.addLayer({
            id: `${h.id}-fill`,
            type: "fill",
            source: h.source,
            layout: { visibility: "none" },
            filter: ["==", ["get", h.field], "__none__"],
            paint: { "fill-color": "#fde047", "fill-opacity": 0.35 },
          });
          map.addLayer({
            id: `${h.id}-line`,
            type: "line",
            source: h.source,
            layout: { visibility: "none" },
            filter: ["==", ["get", h.field], "__none__"],
            paint: { "line-color": "#f59e0b", "line-width": 3 },
          });
        }

        loadedRef.current = true;

        // Clicking a farm highlights its whole group, zooms to the cluster, and
        // opens the details panel.
        map.on("click", FILL_LAYER_ID, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;
          const props = feature.properties as {
            postcode?: string;
            group_id?: string;
          };
          const groupId = props.group_id ?? "";

          // Emphasise the clicked group: keep every cluster's own colour, but
          // bring the selected one forward and dim the rest.
          const inGroup = ["==", ["get", "group_id"], groupId];
          map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", [
            "case",
            inGroup,
            0.92,
            0.25,
          ] as mapboxgl.ExpressionSpecification);
          map.setPaintProperty(LINE_LAYER_ID, "line-width", [
            "case",
            inGroup,
            2.5,
            0.5,
          ] as mapboxgl.ExpressionSpecification);

          // Zoom to the bounding box of all farms in the clicked group.
          const groupFeatures = farmsRef.current.features.filter(
            (f) => f.properties.group_id === props.group_id
          );
          const bounds = new mapboxgl.LngLatBounds();
          for (const f of groupFeatures) {
            eachPosition(f.geometry.coordinates, (p) => bounds.extend(p));
          }
          if (!bounds.isEmpty()) {
            // Reserve room for the details panel: on the right on desktop, at
            // the bottom (where the sheet sits) on mobile.
            const wide = window.innerWidth >= 640;
            map.fitBounds(bounds, {
              padding: wide
                ? { top: 60, bottom: 60, left: 60, right: 360 }
                : {
                    top: 70,
                    bottom: Math.round(window.innerHeight * 0.45),
                    left: 24,
                    right: 24,
                  },
              maxZoom: 14,
              duration: 800,
            });
          }

          // Surface the group's details into the floating panel.
          const group = groupsRef.current.find(
            (g) => g.groupId === props.group_id
          );
          setSelectedGroup(group ?? null);
        });

        // Clicking the map away from any farm clears the selection.
        map.on("click", (e) => {
          const hit = map.queryRenderedFeatures(e.point, {
            layers: [FILL_LAYER_ID],
          });
          if (hit.length === 0) clearSelection();
        });

        map.on("mousemove", FILL_LAYER_ID, (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const gid = (f.properties as { group_id?: string }).group_id;
          const group = groupsRef.current.find((g) => g.groupId === gid);
          // setText (not setHTML) so group names can't inject markup.
          hoverPopup
            .setLngLat(e.lngLat)
            .setText(group?.name ?? "Unknown group")
            .addTo(map);
        });
        map.on("mouseleave", FILL_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          hoverPopup.remove();
        });

        setReady(true);

        // Reveal only once the first frame with data has rendered.
        map.once("idle", () => setVisible(true));
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
      didFitRef.current = false;
    };
  }, [clearSelection]);

  // Push filtered farms (from the search bar) to the map whenever they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("farms") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(farms);
  }, [farms]);

  // Colour each cluster distinctly (group_id -> palette colour).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty(
      FILL_LAYER_ID,
      "fill-color",
      farmColorExpression(groups.map((g) => g.groupId)),
    );
  }, [groups, ready]);

  // On first load, fit the view to all farms (instant, so the splash reveals an
  // already-framed map). Runs once; later filtering won't re-frame the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || didFitRef.current || farms.features.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const f of farms.features) {
      eachPosition(f.geometry.coordinates, (p) => bounds.extend(p));
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, duration: 0 });
      didFitRef.current = true;
    }
  }, [farms, ready]);

  // Toggle catchment / river-basin layer visibility from the layers panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty("catchments-fill", "visibility", vis(layers.catchments));
    map.setLayoutProperty("catchments-line", "visibility", vis(layers.catchments));
    map.setLayoutProperty("districts-fill", "visibility", vis(layers.basins));
    map.setLayoutProperty("districts-line", "visibility", vis(layers.basins));
    map.setLayoutProperty("counties-fill", "visibility", vis(layers.counties));
    map.setLayoutProperty("counties-line", "visibility", vis(layers.counties));
    map.setLayoutProperty("la-fill", "visibility", vis(layers.localAuthorities));
    map.setLayoutProperty("la-line", "visibility", vis(layers.localAuthorities));
    map.setLayoutProperty("rivers-line", "visibility", vis(layers.rivers));
    map.setLayoutProperty(
      "constituencies-fill",
      "visibility",
      vis(layers.constituencies),
    );
    map.setLayoutProperty(
      "constituencies-line",
      "visibility",
      vis(layers.constituencies),
    );
    map.setLayoutProperty("sssi-fill", "visibility", vis(layers.sssi));
    map.setLayoutProperty("sssi-line", "visibility", vis(layers.sssi));
    map.setLayoutProperty("pl-fill", "visibility", vis(layers.protectedLandscapes));
    map.setLayoutProperty("pl-line", "visibility", vis(layers.protectedLandscapes));
    map.setLayoutProperty("nvz-fill", "visibility", vis(layers.nvz));
    map.setLayoutProperty("nvz-line", "visibility", vis(layers.nvz));
  }, [layers, ready]);

  // Toggle the satellite basemap (vs the default Standard map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty(
      "satellite-basemap",
      "visibility",
      basemap === "satellite" ? "visible" : "none",
    );
  }, [basemap, ready]);

  // Scope the context layers to the river basins the search is filtering by, so
  // the overlays match the farms on screen. No filter selected → show all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const filter = (activeDistricts.length
      ? ["in", ["get", "river_basin_district"], ["literal", activeDistricts]]
      : null) as mapboxgl.FilterSpecification | null;
    for (const id of [
      "catchments-fill",
      "catchments-line",
      "districts-fill",
      "districts-line",
    ]) {
      map.setFilter(id, filter);
    }
  }, [activeDistricts, ready]);

  // Selecting a group emphasises the basin(s) it spans within the context
  // layers (brighter/thicker) and dims the rest — without removing anything.
  // Reverts to the base paint on deselect. (Search still owns what's filtered.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const stats = selectedGroup ? groupStats[selectedGroup.groupId] : undefined;
    const districts = stats?.districts ?? [];
    const catchmentIds = stats?.catchments.map((c) => c.id) ?? [];

    if (districts.length === 0 && catchmentIds.length === 0) {
      map.setPaintProperty("districts-fill", "fill-opacity", 0.12);
      map.setPaintProperty("districts-line", "line-color", "#0ea5e9");
      map.setPaintProperty("districts-line", "line-width", 1.2);
      map.setPaintProperty("catchments-fill", "fill-opacity", 0.3);
      map.setPaintProperty("catchments-line", "line-width", 0.8);
      return;
    }

    // Basins: emphasise the whole basin(s) the group sits in.
    const inBasin = ["in", ["get", "river_basin_district"], ["literal", districts]];
    map.setPaintProperty(
      "districts-fill",
      "fill-opacity",
      ["case", inBasin, 0.3, 0.04] as mapboxgl.ExpressionSpecification,
    );
    map.setPaintProperty(
      "districts-line",
      "line-color",
      ["case", inBasin, "#0284c7", "#0ea5e9"] as mapboxgl.ExpressionSpecification,
    );
    map.setPaintProperty(
      "districts-line",
      "line-width",
      ["case", inBasin, 2.5, 0.6] as mapboxgl.ExpressionSpecification,
    );

    // Catchments: emphasise only the specific catchments the group's farms fall
    // in — not every catchment in the basin.
    const inCatch = ["in", ["get", "catchment_id"], ["literal", catchmentIds]];
    map.setPaintProperty(
      "catchments-fill",
      "fill-opacity",
      ["case", inCatch, 0.45, 0.06] as mapboxgl.ExpressionSpecification,
    );
    map.setPaintProperty(
      "catchments-line",
      "line-width",
      ["case", inCatch, 1.6, 0.3] as mapboxgl.ExpressionSpecification,
    );
  }, [selectedGroup, groupStats, ready]);

  // The selected group's facts + whether it still has farms on the (filtered)
  // map. When a filter hides it, the card is gated out so it never lingers on
  // something that isn't shown.
  const selectedShown = useMemo(
    () =>
      !!selectedGroup &&
      farms.features.some((f) => f.properties.group_id === selectedGroup.groupId),
    [selectedGroup, farms],
  );
  const selectedStats = selectedGroup ? groupStats[selectedGroup.groupId] : undefined;

  return (
    <div className="relative w-full h-full bg-[#23263a]">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Data attribution for the overlays (the basemap's © Mapbox / © OSM is
          shown by Mapbox's own control). Sits just above it, bottom-right. */}
      <div className="pointer-events-none absolute bottom-6 right-1 z-10 max-w-[60vw] rounded bg-white/65 px-1.5 py-0.5 text-right text-[9px] leading-tight text-black/55">
        Boundaries &amp; rivers: contains OS / ONS data © Crown copyright &amp; database
        right 2024 (OGL v3) · Catchments &amp; river basins: © Environment Agency
      </div>

      {/* Loading overlay: sits on top of the (already rendering) map and fades
          out once the first frame is painted — the expected app-load feel.
          Mirrors the Aggregate card's branding. */}
      <div
        className={`absolute inset-0 z-50 flex items-center justify-center bg-[#23263a] transition-opacity duration-500 ease-out ${
          visible ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bubbles-orange.svg" alt="" className="h-16 w-16 shrink-0" />
            <div className="leading-tight">
              <h1 className="text-3xl font-bold tracking-tight text-slate-100/90">
                Facilitator Forum
              </h1>
              <p className="text-sm text-white/70">Discover your local farm group</p>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/loading_fat_worm.svg" alt="Loading" className="h-16 w-16" />

          <div className="flex items-center gap-2 opacity-90">
            <span className="text-xs text-white/60">Powered by</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sb-logo.png" alt="SoilBenchmark" className="h-5 w-auto" />
          </div>
        </div>
      </div>

      {/* Group details card — bottom-right, shown on farm click. */}
      {selectedGroup && selectedShown && (
        <div className="pointer-events-auto absolute inset-x-2 bottom-4 z-30 max-h-[55dvh] overflow-y-auto rounded-2xl bg-white/90 px-4 py-3 text-gray-900 shadow-lg ring-1 ring-black/5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:bottom-9 sm:w-80 sm:max-h-[60vh]">
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Close group details"
              className="absolute right-2.5 top-2.5 rounded p-1 text-gray-400 hover:bg-gray-900/10 hover:text-gray-700"
            >
              <X size={16} />
            </button>

            <h2 className="pr-6 text-base font-semibold text-gray-900 wrap-break-word">
              {selectedGroup.name}
            </h2>

            {selectedGroup.description && (
              <p className="mt-1 text-sm text-gray-600 wrap-break-word">
                {selectedGroup.description}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {selectedStats && (
                <>
                  <dt className="font-medium text-gray-500">Farms</dt>
                  <dd className="min-w-0 text-gray-700">
                    {selectedStats.farmCount}
                  </dd>
                  <dt className="font-medium text-gray-500">Area</dt>
                  <dd className="min-w-0 text-gray-700">
                    {Math.round(selectedStats.areaHa).toLocaleString()} ha
                  </dd>
                </>
              )}
              {selectedGroup.contactName && (
                <>
                  <dt className="font-medium text-gray-500">Contact</dt>
                  <dd className="min-w-0 text-gray-700 wrap-break-word">
                    {selectedGroup.contactName}
                  </dd>
                </>
              )}
              {selectedGroup.contactEmail && (
                <>
                  <dt className="font-medium text-gray-500">Email</dt>
                  <dd className="min-w-0">
                    <a
                      href={`mailto:${selectedGroup.contactEmail}`}
                      className="text-orange-600 hover:underline break-all"
                    >
                      {selectedGroup.contactEmail}
                    </a>
                  </dd>
                </>
              )}
              {selectedGroup.website && (
                <>
                  <dt className="font-medium text-gray-500">Website</dt>
                  <dd className="min-w-0">
                    <a
                      href={
                        /^https?:\/\//.test(selectedGroup.website)
                          ? selectedGroup.website
                          : `https://${selectedGroup.website}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:underline break-all"
                    >
                      {selectedGroup.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </>
              )}
            </dl>

            {/* Thematic labels shown above the overlap sections. */}
            {selectedGroup.labels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {selectedGroup.labels.map((label) => {
                  const color = labelColors[label];
                  return (
                    <Badge
                      key={label}
                      className="rounded-full border-transparent px-3 py-1 text-xs font-semibold"
                      style={
                        color
                          ? {
                              backgroundColor: color,
                              color: readableText(color),
                            }
                          : undefined
                      }
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
            )}

            {selectedStats && selectedStats.districts.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  River basin ({selectedStats.districts.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.districts.map((d) => (
                    <span
                      key={d}
                      onMouseEnter={() => highlightArea("hl-districts", d)}
                      onMouseLeave={clearHighlight}
                      className="inline-flex cursor-default items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900 hover:bg-sky-200"
                    >
                      <Waves size={12} aria-hidden="true" />
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.catchments.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  Sub-catchments ({selectedStats.catchments.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedStats.catchments.map((c) => (
                    <span
                      key={c.id}
                      onMouseEnter={() => highlightArea("hl-catchments", c.id)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-100 hover:bg-sky-100"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.counties.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  County ({selectedStats.counties.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.counties.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-counties", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.localAuthorities.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  Local authority ({selectedStats.localAuthorities.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.localAuthorities.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-la", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 hover:bg-violet-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.constituencies.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  Constituency ({selectedStats.constituencies.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.constituencies.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-constituencies", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900 hover:bg-rose-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.sssi.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  SSSIs ({selectedStats.sssi.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.sssi.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-sssi", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900 hover:bg-green-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.protectedLandscapes.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  National Parks &amp; Landscapes (
                  {selectedStats.protectedLandscapes.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.protectedLandscapes.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-pl", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedStats && selectedStats.nvz.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  Nitrate Vulnerable Zones ({selectedStats.nvz.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.nvz.map((c) => (
                    <span
                      key={c}
                      onMouseEnter={() => highlightArea("hl-nvz", c)}
                      onMouseLeave={clearHighlight}
                      className="cursor-default rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 hover:bg-red-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  if (selectedGroup) onRemoveGroup?.(selectedGroup.groupId);
                  clearSelection();
                }}
                className="mt-4 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
              >
                Remove cluster
              </button>
            )}
          </div>
        )}

    </div>
  );
};

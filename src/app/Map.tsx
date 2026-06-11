"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Info, Waves, X } from "lucide-react";
import { WATER_BODY_COLORS, WATER_BODY_FALLBACK } from "./catchmentFilters";
import type { FarmGroup, FarmsGeoJSON, Label } from "@/lib/farmData";
import { Badge } from "@/components/ui/badge";
import { readableText } from "@/lib/utils";

const INITIAL_CENTER: [number, number] = [-1.5491, 53.8008];
const INITIAL_ZOOM = 5;

const FILL_LAYER_ID = "farms-fill";
const LINE_LAYER_ID = "farms-line";

// Base farm colours (unselected); a clicked group is highlighted by darkening.
const FARM_FILL = "#ff7a00";
const FARM_LINE = "#ff9933";
const HIGHLIGHT_FILL = "#662b00";
const HIGHLIGHT_LINE = "#803600";

// Mapbox match expression: water_body_type -> colour.
const waterBodyColor = [
  "match",
  ["get", "water_body_type"],
  ...Object.entries(WATER_BODY_COLORS).flatMap(([type, color]) => [type, color]),
  WATER_BODY_FALLBACK,
] as mapboxgl.ExpressionSpecification;

export type LayerVisibility = {
  catchments: boolean;
  basins: boolean;
};

export type GroupStats = {
  farmCount: number;
  districts: string[];
  catchments: { id: string; name: string }[];
};

type MapProps = {
  farms: FarmsGeoJSON;
  groups: FarmGroup[];
  labels: Label[];
  layers: LayerVisibility;
  groupStats: Record<string, GroupStats>;
  activeDistricts: string[];
};

export const Map = ({
  farms,
  groups,
  labels,
  layers,
  groupStats,
  activeDistricts,
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
  // The "about / why Aggregate" popover on the badge.
  const [aboutOpen, setAboutOpen] = useState(false);

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
      map.setPaintProperty(FILL_LAYER_ID, "fill-color", FARM_FILL);
      map.setPaintProperty(LINE_LAYER_ID, "line-color", FARM_LINE);
      map.setPaintProperty(LINE_LAYER_ID, "line-width", 1);
    }
    setSelectedGroup(null);
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
      const [catchmentsData, districtsData] = await Promise.all([
        fetch("/data/catchments.simplified.geojson").then((r) => r.json()),
        fetch("/districts.geojson").then((r) => r.json()),
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

        // Farms on top (data comes from props; updated via setData below).
        map.addSource("farms", { type: "geojson", data: farmsRef.current });
        map.addLayer({
          id: FILL_LAYER_ID,
          type: "fill",
          source: "farms",
          paint: { "fill-color": FARM_FILL, "fill-opacity": 0.85 },
        });
        map.addLayer({
          id: LINE_LAYER_ID,
          type: "line",
          source: "farms",
          paint: { "line-color": FARM_LINE, "line-width": 1 },
        });

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

          // Highlight all farms in the clicked group in a single repaint.
          map.setPaintProperty(FILL_LAYER_ID, "fill-color", [
            "case",
            ["==", ["get", "group_id"], groupId],
            HIGHLIGHT_FILL,
            FARM_FILL,
          ]);
          map.setPaintProperty(LINE_LAYER_ID, "line-color", [
            "case",
            ["==", ["get", "group_id"], groupId],
            HIGHLIGHT_LINE,
            FARM_LINE,
          ]);
          map.setPaintProperty(LINE_LAYER_ID, "line-width", [
            "case",
            ["==", ["get", "group_id"], groupId],
            3,
            1,
          ]);

          // Zoom to the bounding box of all farms in the clicked group.
          const groupFeatures = farmsRef.current.features.filter(
            (f) => f.properties.group_id === props.group_id
          );
          const bounds = new mapboxgl.LngLatBounds();
          for (const f of groupFeatures) {
            for (const ring of f.geometry.coordinates) {
              for (const coord of ring) {
                bounds.extend(coord as [number, number]);
              }
            }
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

  // On first load, fit the view to all farms (instant, so the splash reveals an
  // already-framed map). Runs once; later filtering won't re-frame the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || didFitRef.current || farms.features.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const f of farms.features) {
      for (const ring of f.geometry.coordinates) {
        for (const coord of ring) bounds.extend(coord as [number, number]);
      }
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
  }, [layers, ready]);

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
                Aggregate
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
            </dl>

            {selectedStats && selectedStats.districts.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-gray-500">
                  River basin
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStats.districts.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-900"
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
                  Catchments ({selectedStats.catchments.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedStats.catchments.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-100"
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        )}

      {/* Aggregate badge — bottom-left. Hidden on mobile while a details card
          is open so the two don't overlap. */}
      <div
        className={`pointer-events-none absolute bottom-9 left-4 z-10 w-64 flex-col rounded-2xl bg-slate-500/80 px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur-md ${
          selectedGroup && selectedShown ? "hidden sm:flex" : "flex"
        }`}
      >
        <button
          type="button"
          onClick={() => setAboutOpen((v) => !v)}
          aria-label="About Aggregate"
          aria-expanded={aboutOpen}
          className="pointer-events-auto absolute right-2 top-2 rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
        >
          <Info size={15} aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bubbles-orange.svg" alt="" className="h-11 w-11 shrink-0" />
          <div className="leading-tight">
            <h1 className="text-xl font-bold tracking-tight text-slate-100/90">Aggregate</h1>
            <p className="text-xs text-white/70">Discover your local farm group</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-white/15 pt-2.5">
          <span className="text-xs text-white/70">Powered by</span>
          <a
            href="https://soilbenchmark.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Soil Benchmark (opens in a new tab)"
            className="pointer-events-auto opacity-90 transition hover:opacity-100"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sb-logo.png" alt="SoilBenchmark" className="h-5 w-auto" />
          </a>
        </div>

      </div>

      {/* About modal — centred, blurs the whole background while open. */}
      {aboutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setAboutOpen(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto animate-[menu-pop_160ms_ease-out] rounded-2xl bg-slate-600/90 p-6 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md sm:p-8"
          >
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/bubbles-orange.svg" alt="" className="h-14 w-14 shrink-0" />
              <h2 className="text-3xl font-bold tracking-tight text-slate-100/90">
                Why Aggregate?
              </h2>
            </div>

            <div className="mt-5 space-y-3.5 text-base leading-relaxed text-white/80">
              <p>
                Aggregate brings the farmer groups working to improve their soil
                and water onto one shared map.
              </p>
              <p>
                Search your area to find the group nearest you, then switch on
                layers to see the river catchments and basins your land sits
                within — the shared context behind every soil and water decision.
              </p>
              <p>
                Knowing your neighbours and your landscape is where better,
                collective stewardship of the soil begins.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

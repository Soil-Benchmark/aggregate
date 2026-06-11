"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { X } from "lucide-react";
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

type MapProps = {
  farms: FarmsGeoJSON;
  groups: FarmGroup[];
  labels: Label[];
};

export const Map = ({ farms, groups, labels }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const farmsRef = useRef<FarmsGeoJSON>(farms);
  const groupsRef = useRef<FarmGroup[]>(groups);
  const [selectedGroup, setSelectedGroup] = useState<FarmGroup | null>(null);
  // Fade the map in once it has actually painted, to avoid a blank/white flash.
  const [visible, setVisible] = useState(false);

  // label name -> color, for tinting the panel tags like the search bar does.
  // (Plain object, not a Map — `Map` is this component's own name here.)
  const labelColors = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.label, l.color])),
    [labels]
  );

  // Reset the highlight paint + close the details panel.
  const clearSelection = () => {
    const map = mapRef.current;
    if (map && loadedRef.current) {
      map.setPaintProperty(FILL_LAYER_ID, "fill-color", FARM_FILL);
      map.setPaintProperty(LINE_LAYER_ID, "line-color", FARM_LINE);
      map.setPaintProperty(LINE_LAYER_ID, "line-width", 1);
    }
    setSelectedGroup(null);
  };

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
        "/data/catchments.simplified.geojson",
      ).then((r) => r.json());
      if (cancelled || !mapContainer.current || mapRef.current) return;

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
            map.fitBounds(bounds, {
              // Extra right padding so the cluster isn't hidden behind the panel.
              padding: { top: 60, bottom: 60, left: 60, right: 360 },
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

        // Reveal only once the first frame with data has rendered.
        map.once("idle", () => setVisible(true));
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
    const source = map.getSource("farms") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(farms);
  }, [farms]);

  return (
    <div className="relative w-full h-full bg-[#23263a]">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading overlay: sits on top of the (already rendering) map and fades
          out once the first frame is painted — the expected app-load feel.
          Mirrors the Aggregate card's branding. */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center bg-[#23263a] transition-opacity duration-500 ease-out ${
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

      {/* Bottom-right column: the group details box (on farm click) sits just
          above the Aggregate card, in a matching translucent style. */}
      <div className="absolute bottom-9 right-4 z-10 flex w-64 flex-col gap-2.5">
        {selectedGroup && (
          <div className="pointer-events-auto relative max-h-[60vh] overflow-y-auto rounded-2xl bg-white/90 px-4 py-3 text-gray-900 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
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

        <div className="pointer-events-none flex flex-col rounded-2xl bg-slate-500/80 px-4 py-3 shadow-lg ring-1 ring-black/5 backdrop-blur-md">
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sb-logo.png" alt="SoilBenchmark" className="h-5 w-auto opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
};

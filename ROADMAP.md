# Facilitator Forum — build status & roadmap

A public map/directory of UK farmer groups ("clusters"): find your local group,
see which catchments / counties / designations etc. each cluster's land touches,
and (for authorised users) add clusters/farms. Independent; supported by the
Frank Parkinson Agricultural Trust. Built by Soil Benchmark (was codename
"Aggregate"; user-facing name "Facilitator Forum").

## Where things are
- Repo: `Soil-Benchmark/aggregate`. Local: `~/Documents/GitHub/aggregate`.
- Working branch: **`tom/visual-tweaks`** (NOT main; not pushed). Do not push to main / auto-deploy without review.
- Stack: Next.js (App Router) + React/TS + Mapbox GL + Tailwind v4 + Turf. Data in `public/data/*.geojson`.
- Live POC deploy (older): https://aggregate-d4652aik2a-nw.a.run.app (Cloud Run).

## How to run locally (demo)
```
cd ~/Documents/GitHub/aggregate
npm install
npm run dev        # http://localhost:3000   (for demo, prefer: npm run build && npm start)
```
`.env` has the Mapbox token (copied from topsoil). No GCS locally → the app falls
back to a bundled seed (`public/data/seed-live.json`, a read-only copy of the 31
live clusters). Adds (SBI/shapefile/cluster) are **in-memory only** locally — they
never write to the live store.

## Built so far
- SB-themed UI: floating green top bar (logo + "Facilitator Forum" + i + stats),
  white SB-style search box, white map controls (compass/+/−/3D/map-type), 3D terrain.
- Clusters coloured distinctly; click → details popup (farms, area-from-geometry,
  and every river basin / catchment / county / LA / constituency / SSSI the land
  **intersects** — hover a chip to highlight it on the map).
- Add dialog (authorised-only stub): add a cluster (name/desc/website/contact/labels,
  + optional multi-farm shapefile with a farm-count) or add a farm by **shapefile**
  (.zip/GeoJSON, reprojects BNG→WGS84) / **SBI** (live, via /api/sbi) / postcode (legacy).
  Parcels are unioned + clusters dissolved so individual field parcels are merged (anonymised).
- "Remove cluster" (authorised) in the popup. 📊 Map-stats panel (clusters/farms/area +
  touched/total per layer). Map-type switch (Standard/Satellite). Discreet "Powered by Soil Benchmark".
- Layers panel: **Water** (rivers, catchments, river basins), **Boundaries** (counties,
  local authorities, constituencies), **Designations** (SSSIs [GB], National Parks &
  Landscapes [GB], Nitrate Vulnerable Zones [England]).
- Cluster popup: thematic labels on top, then overlap sections (each with a count),
  contact name / email / website.

## Data layers & sources (all GB unless noted)
- Rivers (major, named >35km): OS Open Rivers (GeoPackage).
- Catchments: EA (England) + SEPA layer 8 intercatchments (Scotland) + NRW WFD river
  waterbody catchments (Wales, DataMapWales WFS).
- River basins: **GB-wide, 132 features**, split by major river ("rivers that drain to
  the sea" - Tyne/Wear/Tees, Trent/Ouse separate, etc.). England = EA WFD Surface Water
  Management Catchments Cycle 2 (103); Wales = NRW WFD Management Catchments C2 (19,
  DataMapWales `inspire-nrw:NRW_WFD_MGT_CATCHMENTS_C2`); Scotland = SEPA "Main river and coastal
  catchments" (map.sepa.org.uk Open/Hydrography layer 12) filtered to >400 km² (~48,
  major rivers: Dee/Grampian, Don, Deveron, Spey, Tay, Forth, Tweed, Nith, Findhorn,
  Ythan… - replaced the old 10 WFD Sub Units which lumped NE Scotland's rivers together).
  All stored in `districts.geojson` under field `river_basin_district` (kept the old field
  name so all wiring is unchanged). Seed farms (all England) re-baked via
  `scripts/rebake-basins.mjs`. (Superseded the old coarse RBD dissolve, which had
  corrupted geometry - North West wrongly spanning NE England, Dee null, etc.)
- Counties/UAs + Local authorities + Westminster constituencies: ONS (Open Geography).
- SSSIs: Natural England (England only so far).
- **SBI → farm boundary**: public DEFRA RPA "LandCovers" WFS, no auth —
  `environment.data.gov.uk/data-services/RPA/LandCovers/wfs?...cql_filter=SBI=<sbi>&srsname=EPSG:4326&outputFormat=application/json`.
  (This is how SB's own `add_farm` in regolith/integrate sources boundaries.)
- Attribution watermark bottom-right (OS/ONS/EA/OGL).

## Known issue
- Total static data ≈ 50 MB (catchments ~23 MB, SSSI ~11 MB dominate). Fine on a
  laptop loaded in advance; too heavy for phones on weak wifi. → fixed in Track B (tiles).

## Plan

### Track A — Groundswell demo (get facilitators keen) — DO FIRST
Demo runs on **Tom's laptop, loaded in advance**, so the 50 MB isn't a blocker; only
the Mapbox basemap needs live internet. So lazy-load is NOT needed for the demo.
1. Add **facilitator-relevant layers** — DONE: Scottish & Welsh SSSIs, National Parks
   & National Landscapes (England/Scotland/Wales), NVZs (England). **CSFF clusters
   NOT done** — Natural England publishes only individual CS *agreement* holdings, not
   facilitation-*group* boundaries, so there's no clean polygon dataset (would need a
   FOI / direct ask to NE). Parked.
   - Data sources added: NVZ = environment.data.gov.uk NVZ-2021 GeoJSON (dissolved by
     type). Scotland parks/NSAs = maps.gov.scot ScotGov/ProtectedSites MapServer (0,1,3).
     Wales parks/AONB/SSSI = DataMapWales geoserver WFS (inspire-nrw). Scotland SSSI =
     NatureScot FeatureServer (services1.arcgis.com/LM9GyVFsughzHdbO). England parks/AONB
     = Natural England (services.arcgis.com/JJzESW51TqeY9uat).
2. Content + polish pass.
3. Stable local **demo build** (`npm run build && npm start`).
- Demo-day reliability: run locally; pre-cache basemap by panning the demo areas on
  good wifi beforehand; open before going on stage; pre-add any SBI demo farms (live SBI needs internet).

### Track B — Go live / productionise (after Groundswell)
Goal: host cheaply on the SB website, let others **embed** it, low maintenance.
- **Lazy-load** layers (data loads on toggle, not on open) — for phones/public.
- **Vector tiles (PMTiles)**: single static files, no tile server. Render heavy layers
  from tiles (fast + fully accurate). Keep slim geometry (or move to PostGIS) for the
  cluster-intersection/stats logic, which currently needs all features client-side.
  (tippecanoe + `pmtiles` npm already installed.)
- **Static build + iframe embed** ("Powered by Soil Benchmark"). Others embed your one
  hosted instance (one DB, many windows) — they do NOT self-host copies.
- **Central store = source of truth**: groups/farms in a Google Cloud Storage bucket
  (`groups.json`/`farms.json`, read via `/api/data`; authorised adds write here). Lightweight,
  no DB server. Map layers stay static assets, not in the store. NB if pushing to the team
  repo, don't commit the big geojson — serve from GCS/tiles.

## To continue in a new session
Open Claude Code **in `~/Documents/GitHub/aggregate`** and point it at this file.

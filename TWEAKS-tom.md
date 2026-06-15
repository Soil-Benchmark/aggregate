# Tom's morning brief — vibecoding Aggregate

This is a local note (not committed). Setup was done the night before by Claude.

## How to start it
Open Claude Code in this folder (`~/Documents/GitHub/aggregate`) and just say:
> "Start the app and open it so I can see it."
(It runs `npm run dev` → http://localhost:3000.)

Then describe a tweak in plain English and let Claude Code make it. **Work on a branch and open a PR — do NOT push to main** (main auto-deploys to the live site).

## Setup state
- ✅ Dependencies installed (`npm install` done).
- ✅ Mapbox token added to `.env` (copied from topsoil) — so the **map, controls and search bar will render**.
- ❌ Google Cloud Storage NOT configured — so the **farm-group data won't load locally** (the `/api/*` routes return 503; map shows the basemap but no farm polygons). This is fine for the visual tweaks below. If you later want the real farm groups to show locally, ask Henry/Ben for the GCS bucket name + a service-account key (or ask Claude to sort it).

## The tweaks Tom wants

### Quick wins — pure visual, no data needed (do these first)
1. **SB-style map controls.** Add the control cluster from the main SB app (the little stacked buttons: locate/compass, +, −, fullscreen, 3D, layers, camera) so it feels more Soil-Benchmark-y. Files: `src/app/Map.tsx` / `src/app/MapView.tsx`. Reference topsoil's map controls at `~/Documents/GitHub/topsoil` for styling/behaviour to copy.
2. **Recolour the search bar + icons.** Currently grey/slate — make it an SB colour (green or cream). Files: `src/app/SearchBar.tsx` and `src/app/globals.css`. For the right hexes, look at `~/Documents/GitHub/topsoil/src/app/globals.css` (SB theme) and www.soilbenchmark.com.

### Bigger — touch data/layers, may need the team or a data file (leave or treat carefully)
3. **River basins → rivers.** Today the layer shows large "river basin districts" (e.g. Northumbria). Tom wants the smaller, recognisable rivers-to-sea instead (Tyne / Wear / Tees). This is data-driven — see `src/app/catchmentFilters.ts` and the catchment/basin data source. Likely needs the catchment dataset (GCS) and isn't a 5-min change — scope before diving in.
4. **Counties overlay** (like the existing "water" layer) and **SSSIs overlay.** New map layers. Tom can export the data from Magic Maps (as GeoJSON). Adding an overlay is moderate frontend in `src/app/Map.tsx` plus a data file — bigger than the colour tweaks.

## Repo facts
- Next.js (App Router) + React + TypeScript, Mapbox GL, Tailwind v4, Turf for geometry.
- Source under `src/app/`. Live demo: https://aggregate-d4652aik2a-nw.a.run.app
- Linear project: "Farm Group Directory Hackathon". Slack: #farm-groups-hackathon.

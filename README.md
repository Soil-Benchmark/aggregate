# Aggregate

**Discover your local farm group — and see the river catchments and basins your land shares — on one map.**

Aggregate brings the farmer groups working to improve their soil and water onto a single interactive map. Search for your area to find the group nearest you, switch on layers to see the river catchments and basins your land sits within, and add your own farm or group to the map.

Built by [Soil Benchmark](https://soilbenchmark.com).

---

## How it works

- **Map** — a Mapbox GL map (Standard style, faded theme) showing farm polygons, with optional river-catchment and basin overlays.
- **Search** — a type-first omni search: start typing to match group names, labels, and river basin districts; tags compose with AND/OR semantics.
- **Click a farm** — highlights the whole group, zooms to it, and opens a details card with farm count, contacts, the river basin(s), and the catchments the group intersects.
- **Add to the map** — the `+` control opens a dialog to:
  - **Add a farm** — geocode an address (Mapbox), state its size in hectares; the server buffers the point into a hectare-sized polygon and computes its river basin district + catchment on the fly.
  - **Add a group** — name, description, contacts, and labels (stored on the group).
- **Storage** — submitted groups and farms are persisted to a Google Cloud Storage bucket. The seed dataset also lives in GCS; the API enriches raw farms with district/catchment at read time.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) for the map + Geocoding API for address search
- [Tailwind CSS](https://tailwindcss.com) v4
- [Turf](https://turfjs.org) for geometry (centroid, buffer, point-in-polygon)
- [Google Cloud Storage](https://cloud.google.com/storage) for persistence

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill it in:

```ini
# Mapbox token (basemap + address geocoding)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.********

# Google Cloud Storage (required — there is no static fallback)
GCS_BUCKET=your-bucket-name
GCS_PROJECT_ID=your-gcp-project
# Provide ONE credential:
GCS_SERVICE_ACCOUNT_KEY=./gcs-key.json        # path, OR inline service-account JSON
# GOOGLE_APPLICATION_CREDENTIALS=./gcs-key.json  # alternatively, ADC

# Optional: absolute site URL for share-link metadata (falls back to VERCEL_URL / localhost)
NEXT_PUBLIC_SITE_URL=https://aggregate.example.com
```

### 3. Set up the GCS bucket

```bash
export PROJECT_ID="your-gcp-project"
export BUCKET="your-bucket-name"
gcloud config set project "$PROJECT_ID"
gcloud services enable storage.googleapis.com

# Private bucket
gcloud storage buckets create "gs://$BUCKET" \
  --location=europe-west2 --uniform-bucket-level-access --public-access-prevention

# Service account with read/write on the bucket
gcloud iam service-accounts create aggregate-storage --display-name="Aggregate storage writer"
export SA_EMAIL="aggregate-storage@$PROJECT_ID.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" --role="roles/storage.objectAdmin"
gcloud iam service-accounts keys create ./gcs-key.json --iam-account="$SA_EMAIL"
```

### 4. Seed the bucket

Uploads the base dataset (`data/groups.json`, raw `data/farms.geojson`) to GCS:

```bash
node scripts/seed-gcs.mjs          # skips objects that already exist
node scripts/seed-gcs.mjs --force  # overwrite them
```

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

## Data model

| Where | File | Purpose |
| --- | --- | --- |
| **GCS bucket** | `groups.json` | All groups (seed + user-added); labels live on each group |
| **GCS bucket** | `farms.geojson` | Raw base farm polygons (immutable seed) |
| **GCS bucket** | `farms-added.json` | User-added farm features (already enriched) |
| `data/` (source) | `groups.json`, `farms.geojson` | Seed sources, uploaded to GCS by `seed-gcs.mjs` |
| `public/data/` (web) | `catchments.geojson`, `districts.geojson` | Map overlays + server-side point-in-polygon |
| `public/data/` (web) | `labels.json` | Label name → colour palette |

The API serves the live dataset from GCS via `GET /api/data`, enriching the raw base farms with `river_basin_district` and `catchment_id`/`catchment_name` on the fly (cached in memory). The basin list shown in search is derived from `districts.geojson`.

## API

| Route | Method | Description |
| --- | --- | --- |
| `/api/data` | GET | Live groups + enriched farms (503 if GCS unconfigured) |
| `/api/groups` | POST | Add a group → appends to `groups.json` |
| `/api/farms` | POST | Add a farm: buffers point→polygon, computes district/catchment → appends to `farms-added.json` |

## Project structure

```
src/
  app/
    MapView.tsx        composition: map + search + layers + add
    Map.tsx            Mapbox map, layers, selection, details card
    SearchBar.tsx      omni search / filter tags
    AddDialog.tsx      add farm / add group dialog
    api/{data,groups,farms}/route.ts   GCS-backed endpoints
    opengraph-image.tsx / twitter-image.tsx / icon.svg   share + favicon
  lib/
    farmData.ts        client data loading (GCS via /api/data)
    filters.ts         search filter logic
    gcs.ts             GCS read/write helper
    locate.ts          server-side point → district/catchment
scripts/
  seed-gcs.mjs         seed the bucket from data/
data/                  raw source data (uploaded to GCS)
public/data/           web-served reference geojson + label palette
```

## Deployment notes

- **GCS is required.** Set `GCS_BUCKET` + a credential in the deploy environment. For serverless, prefer the inline `GCS_SERVICE_ACCOUNT_KEY` (no key file on disk).
- Route handlers read geojson from disk at request time. `next.config.ts` traces `public/data/**` into the standalone build (`output: "standalone"`); verify those files ship with your function.
- `public/data/catchments.geojson` is the full-resolution file and is served to the browser for the catchments overlay — it's a large download on first load.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint |
| `node scripts/seed-gcs.mjs [--force]` | Seed the GCS bucket from `data/` |

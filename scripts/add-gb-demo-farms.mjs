// One-off: add a spread of demo circular farms across Scotland & Wales, attached
// to existing clusters, so the map visibly covers GB. Circles sized 10-1000 ha
// (like the postcode-buffer farms). Run rebake-basins.mjs afterwards to tag basins.
import { readFileSync, writeFileSync } from 'node:fs';
import buffer from '@turf/buffer';

const seedPath = new URL('../public/data/seed-live.json', import.meta.url);
const seed = JSON.parse(readFileSync(seedPath));

// Spread of locations (made-up postcodes, real-ish town centroids).
const SITES = [
  // Scotland
  { name: 'Dumfries',       postcode: 'DG1 1AA', lng: -3.604, lat: 55.070, ha: 180 },
  { name: 'Ayr',            postcode: 'KA7 1AA', lng: -4.629, lat: 55.458, ha: 95 },
  { name: 'Stirling',       postcode: 'FK7 1AA', lng: -3.936, lat: 56.119, ha: 420 },
  { name: 'Perth',          postcode: 'PH1 1AA', lng: -3.436, lat: 56.397, ha: 260 },
  { name: 'Forfar',         postcode: 'DD8 1AA', lng: -2.889, lat: 56.644, ha: 640 },
  { name: 'Inverurie',      postcode: 'AB51 3AA', lng: -2.373, lat: 57.284, ha: 310 },
  { name: 'Elgin',          postcode: 'IV30 1AA', lng: -3.315, lat: 57.649, ha: 75 },
  { name: 'Inverness',      postcode: 'IV1 1AA', lng: -4.224, lat: 57.478, ha: 520 },
  { name: 'Kelso',          postcode: 'TD5 7AA', lng: -2.434, lat: 55.598, ha: 140 },
  // Wales
  { name: 'Wrexham',        postcode: 'LL13 7AA', lng: -2.993, lat: 53.046, ha: 60 },
  { name: 'Caernarfon',     postcode: 'LL55 1AA', lng: -4.275, lat: 53.141, ha: 230 },
  { name: 'Welshpool',      postcode: 'SY21 7AA', lng: -3.148, lat: 52.660, ha: 780 },
  { name: 'Aberystwyth',    postcode: 'SY23 1AA', lng: -4.083, lat: 52.415, ha: 110 },
  { name: 'Brecon',         postcode: 'LD3 7AA', lng: -3.393, lat: 51.946, ha: 360 },
  { name: 'Carmarthen',     postcode: 'SA31 1AA', lng: -4.306, lat: 51.857, ha: 200 },
  { name: 'Haverfordwest',  postcode: 'SA61 1AA', lng: -4.969, lat: 51.801, ha: 880 },
];

// Spread across a handful of existing clusters (so they pick up different colours).
const groupIds = seed.groups.map((g) => g.groupId);
const chosen = groupIds.slice(0, 8);

let added = 0;
SITES.forEach((s, i) => {
  const radiusM = Math.sqrt((s.ha * 10000) / Math.PI);
  const circle = buffer(
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } },
    radiusM,
    { units: 'meters', steps: 24 },
  );
  if (!circle) return;
  seed.farms.push({
    type: 'Feature',
    geometry: circle.geometry,
    properties: {
      id: `demo-gb-${i}`,
      postcode: s.postcode,
      group_id: chosen[i % chosen.length],
      river_basin_district: null, // baked by rebake-basins.mjs
      catchment_id: null,
      catchment_name: null,
    },
  });
  added += 1;
});

writeFileSync(seedPath, JSON.stringify(seed));
console.log(`added ${added} demo farms across Scotland & Wales; total farms now ${seed.farms.length}`);

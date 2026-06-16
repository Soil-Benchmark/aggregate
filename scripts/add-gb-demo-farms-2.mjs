// One-off: bulk demo farms across Wales (inland) and Scotland (NE, central belt,
// borders, Highland east coast). Circles only, rejection-sampled inside the
// country land outline so none land in the sea. Run rebake-basins.mjs after.
import { readFileSync, writeFileSync } from 'node:fs';
import buffer from '@turf/buffer';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const seedPath = new URL('../public/data/seed-live.json', import.meta.url);
const seed = JSON.parse(readFileSync(seedPath));

const wales = JSON.parse(readFileSync('/tmp/wal_ctry.geojson')).features[0];
const scotland = JSON.parse(readFileSync('/tmp/sco_ctry.geojson')).features[0];
const england = JSON.parse(readFileSync('/tmp/eng_ctry.geojson')).features[0];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const L = 'ABDEFGHJLNPQRSTUWXYZ';
// Rural-style postcode: region prefix + district + space + sector + 2 letters.
const postcode = (prefixes) =>
  `${pick(prefixes)}${Math.floor(rnd(1, 30))} ${Math.floor(rnd(1, 9))}${pick(
    L.split(''),
  )}${pick(L.split(''))}`;

const walesHa = () => Math.round(rnd(10, 1000));
// Scotland: mostly modest, but ~18% are big estates up to 5000 ha.
const scotHa = () =>
  Math.random() < 0.18 ? Math.round(rnd(1000, 5000)) : Math.round(rnd(10, 1000));

const REGIONS = [
  // Wales inland (Powys / Marches / Brecon) — box already excludes the west coast.
  { land: wales, box: [-3.85, 51.75, -2.7, 53.1], count: 50,
    prefixes: ['LD', 'SY', 'NP'], ha: walesHa },
  // Scotland NE — Angus, Aberdeenshire, Moray, Buchan.
  { land: scotland, box: [-3.6, 56.55, -2.05, 57.75], count: 70,
    prefixes: ['AB', 'DD', 'IV', 'PH'], ha: scotHa },
  // Central belt — Ayrshire, Glasgow, Edinburgh, Stirling, Fife.
  { land: scotland, box: [-4.65, 55.75, -2.7, 56.25], count: 70,
    prefixes: ['FK', 'KY', 'EH', 'ML', 'KA'], ha: scotHa },
  // Borders — Tweed / Teviot / Berwickshire.
  { land: scotland, box: [-3.45, 55.3, -2.05, 55.8], count: 40,
    prefixes: ['TD'], ha: scotHa },
  // Highland east coast — Inverness, Black Isle, Easter Ross, Dornoch.
  { land: scotland, box: [-4.65, 57.4, -3.55, 58.1], count: 20,
    prefixes: ['IV'], ha: scotHa },
  // North of England — Cumbria, Northumberland, Durham, Yorkshire, Lancashire.
  { land: england, box: [-3.1, 53.7, -0.4, 55.3], count: 50,
    prefixes: ['CA', 'LA', 'NE', 'DH', 'DL', 'YO', 'HG'], ha: walesHa },
  // Kent.
  { land: england, box: [0.2, 51.0, 1.4, 51.5], count: 20,
    prefixes: ['CT', 'TN', 'ME'], ha: walesHa },
];

const gids = seed.groups.map((g) => g.groupId);
let idx = 0;
let added = 0;
for (const region of REGIONS) {
  const [w, s, e, n] = region.box;
  let got = 0;
  let attempts = 0;
  while (got < region.count && attempts < region.count * 60) {
    attempts += 1;
    const lng = rnd(w, e);
    const lat = rnd(s, n);
    if (!booleanPointInPolygon([lng, lat], region.land)) continue;
    const ha = region.ha();
    const radiusM = Math.sqrt((ha * 10000) / Math.PI);
    const circle = buffer(
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } },
      radiusM,
      { units: 'meters', steps: 20 },
    );
    if (!circle) continue;
    seed.farms.push({
      type: 'Feature',
      geometry: circle.geometry,
      properties: {
        id: `demo-gb2-${idx++}`,
        postcode: postcode(region.prefixes),
        group_id: gids[idx % gids.length],
        river_basin_district: null,
        catchment_id: null,
        catchment_name: null,
      },
    });
    got += 1;
    added += 1;
  }
  console.log(`region ${region.box.join(',')}: ${got}/${region.count}`);
}

writeFileSync(seedPath, JSON.stringify(seed));
console.log(`added ${added}; total farms now ${seed.farms.length}`);

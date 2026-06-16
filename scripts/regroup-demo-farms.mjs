// One-off: pull the demo farms out of the random English clusters they were added
// to, and group them into new regional clusters (nearest anchor within their own
// country). Existing clusters revert to their English farms only.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const seedPath = new URL('../public/data/seed-live.json', import.meta.url);
const seed = JSON.parse(readFileSync(seedPath));

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
const email = (person, name) =>
  `${person.toLowerCase().replace(/\s+/g, '.')}@${slug(name)}.example.co.uk`;

// region -> postcode prefixes
const REGION = {
  wales: ['LD', 'SY', 'NP', 'LL', 'SA', 'CF'],
  scotland: ['AB', 'DD', 'IV', 'PH', 'FK', 'KY', 'EH', 'ML', 'KA', 'TD', 'DG'],
  nengland: ['CA', 'LA', 'NE', 'DH', 'DL', 'YO', 'HG'],
  kent: ['CT', 'TN', 'ME'],
};
const prefixRegion = (postcode) => {
  const pre = (postcode.match(/^[A-Z]+/) || [''])[0];
  for (const [r, list] of Object.entries(REGION)) if (list.includes(pre)) return r;
  return null;
};

// Anchors: one per new cluster, placed sensibly. [lng, lat] + full details.
const A = (region, lng, lat, name, desc, contact, labels) => ({
  region, lng, lat, groupId: randomUUID(),
  name, description: desc, contactName: contact,
  contactEmail: email(contact, name), website: `https://www.${slug(name)}.example.co.uk`,
  labels,
});

const ANCHORS = [
  // Wales (5)
  A('wales', -4.10, 51.92, 'Tywi Valley Growers', 'Mixed farms along the Tywi swapping notes on grass, grain and the Welsh weather.', 'Megan Llewellyn', ['Livestock & Grazing', 'Soil Health']),
  A('wales', -3.39, 51.95, 'Brycheiniog Soil Group', 'Hill and valley farmers keeping the soil on the slopes of the Beacons.', 'Dafydd Price', ['Soil Health', 'Water & Catchment Management']),
  A('wales', -3.85, 52.40, 'Cambrian Hills Collective', 'Upland growers across the green heart of mid Wales.', 'Carys Hughes', ['Livestock & Grazing', 'Biodiversity']),
  A('wales', -3.15, 52.60, 'Marches Mixed Farming Network', 'Border-country farms mixing arable and stock along the Marches.', 'Rhys Morgan', ['Arable', 'Knowledge & Resource Sharing']),
  A('wales', -4.05, 53.05, 'Eryri Upland Graziers', 'Mountain graziers tending the rough ground beneath Yr Wyddfa.', 'Eleri Wyn', ['Livestock & Grazing', 'Field Margins & Habitat Connectivity']),
  // Scotland (15)
  A('scotland', -2.40, 57.27, 'Aberdeenshire Arable Alliance', 'Big-sky arable farms across the Aberdeenshire plain.', 'Fraser Sinclair', ['Arable', 'Soil Health']),
  A('scotland', -3.32, 57.55, 'Moray Growers', 'Fertile-coast growers between the Spey and the Findhorn.', 'Iona Grant', ['Arable', 'Water & Catchment Management']),
  A('scotland', -2.90, 56.65, 'Strathmore Soil Society', 'Soft-fruit and cereal growers across the strath.', 'Callum Ross', ['Soil Health', 'Regenerative Agriculture']),
  A('scotland', -3.43, 56.40, 'Perthshire Pasture Partnership', 'Grassland and livestock farms in the heart of Perthshire.', 'Eilidh Cameron', ['Livestock & Grazing', 'Biodiversity']),
  A('scotland', -3.94, 56.12, 'Stirlingshire Soil Group', 'Carse-land farmers working the flat ground by the Forth.', 'Greig Buchanan', ['Soil Health', 'Water & Catchment Management']),
  A('scotland', -3.00, 56.30, 'Kingdom of Fife Growers', 'Mixed farms across the Kingdom, from coast to Lomond hills.', 'Morven Reid', ['Arable', 'Knowledge & Resource Sharing']),
  A('scotland', -3.00, 55.88, 'Lothian Land Collective', 'Productive lowland farms ringing the capital.', 'Stuart Aitken', ['Arable', 'Soil Health']),
  A('scotland', -3.78, 55.67, 'Clyde Valley Farmers', 'Orchard and stock farms down the Clyde Valley.', 'Niamh Docherty', ['Livestock & Grazing', 'Biodiversity']),
  A('scotland', -4.50, 55.45, 'Ayrshire Grassland Group', "Dairy and grassland farms on Ayrshire's green west.", 'Lewis Murray', ['Livestock & Grazing', 'Soil Health']),
  A('scotland', -3.78, 56.00, 'Forth Valley Field Group', 'Lowland growers along the upper Forth.', 'Heather Bell', ['Arable', 'Regenerative Agriculture']),
  A('scotland', -2.43, 55.60, 'Tweed Valley Farmers', 'Borders farms following the Tweed from hill to haugh.', 'Robbie Scott', ['Livestock & Grazing', 'Water & Catchment Management']),
  A('scotland', -2.79, 55.42, 'Teviotdale Graziers', 'Hill graziers across the southern uplands.', 'Fiona Elliot', ['Livestock & Grazing', 'Field Margins & Habitat Connectivity']),
  A('scotland', -4.20, 57.50, 'Inverness & Black Isle Farmers', 'Farms ringing the Moray and Beauly firths.', 'Hamish Fraser', ['Arable', 'Soil Health']),
  A('scotland', -4.00, 57.80, 'Easter Ross Growers', 'East-coast Highland farms on the fertile firthlands.', 'Shona Mackay', ['Arable', 'Biodiversity']),
  A('scotland', -3.60, 55.07, 'Nithsdale Farming Cluster', 'Dairy and mixed farms down the Nith to the Solway.', 'Andrew Johnstone', ['Livestock & Grazing', 'Water & Catchment Management']),
  // North of England (3)
  A('nengland', -2.75, 54.66, 'Eden Valley Farmers', 'Fellside and valley farms between the Lakes and the Pennines.', 'Tom Dixon', ['Livestock & Grazing', 'Soil Health']),
  A('nengland', -2.00, 54.60, 'North Pennines Graziers', 'Upland graziers across the high Pennines.', 'Rachel Walton', ['Livestock & Grazing', 'Field Margins & Habitat Connectivity']),
  A('nengland', -1.20, 54.10, 'Vale of York Soil Group', 'Arable growers across the flat, fertile Vale.', 'Will Hartley', ['Arable', 'Soil Health']),
  // Kent (1)
  A('kent', 0.70, 51.20, 'Garden of England Growers', 'Orchard, hop and arable growers across the Kent Weald and downs.', 'Charlotte Ashdown', ['Arable', 'Biodiversity']),
];

const byRegion = {};
for (const a of ANCHORS) (byRegion[a.region] ??= []).push(a);

const centroid = (geom) => {
  // circles → average of the (single) exterior ring.
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
};

let reassigned = 0;
const unmatched = [];
for (const f of seed.farms) {
  if (!f.properties.id.startsWith('demo-gb')) continue;
  const region = prefixRegion(f.properties.postcode || '');
  const anchors = region && byRegion[region];
  if (!anchors) { unmatched.push(f.properties.postcode); continue; }
  const [cx, cy] = centroid(f.geometry);
  let best = null, bestD = Infinity;
  for (const a of anchors) {
    const d = (a.lng - cx) ** 2 + (a.lat - cy) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  f.properties.group_id = best.groupId;
  reassigned += 1;
}

// Append the new clusters.
for (const a of ANCHORS) {
  seed.groups.push({
    groupId: a.groupId, name: a.name, description: a.description,
    contactName: a.contactName, contactEmail: a.contactEmail,
    website: a.website, labels: a.labels,
  });
}

writeFileSync(seedPath, JSON.stringify(seed));
console.log(`reassigned ${reassigned} demo farms into ${ANCHORS.length} new clusters; unmatched: ${unmatched.length}`);
console.log(`groups now ${seed.groups.length}`);

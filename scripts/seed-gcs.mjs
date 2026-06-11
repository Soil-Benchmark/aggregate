// Seed the GCS bucket with the raw base dataset:
//   groups.json    <- data/groups.json
//   farms.geojson  <- data/farms.geojson  (raw; the API enriches on read)
//
// Run: node scripts/seed-gcs.mjs           (skips objects that already exist)
//      node scripts/seed-gcs.mjs --force   (overwrites them)
//
// Reads config from .env (GCS_BUCKET, GCS_PROJECT_ID, and credentials via
// GCS_SERVICE_ACCOUNT_KEY [path or inline JSON] or GOOGLE_APPLICATION_CREDENTIALS).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Storage } from '@google-cloud/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Minimal .env loader (don't overwrite already-set vars).
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const bucketName = process.env.GCS_BUCKET;
if (!bucketName) {
  console.error('GCS_BUCKET is not set (.env).');
  process.exit(1);
}

const projectId = process.env.GCS_PROJECT_ID;
const key = process.env.GCS_SERVICE_ACCOUNT_KEY?.trim();
let storage;
if (key?.startsWith('{')) {
  const credentials = JSON.parse(key);
  storage = new Storage({ projectId: credentials.project_id ?? projectId, credentials });
} else if (key) {
  storage = new Storage({ keyFilename: path.resolve(ROOT, key), projectId });
} else {
  storage = new Storage({ projectId });
}

const force = process.argv.includes('--force');
const bucket = storage.bucket(bucketName);
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const upload = async (object, data) => {
  const file = bucket.file(object);
  const [exists] = await file.exists();
  if (exists && !force) {
    console.log(`skip ${object} (exists; use --force to overwrite)`);
    return;
  }
  await file.save(JSON.stringify(data, null, 2), {
    contentType: 'application/json',
    resumable: false,
  });
  console.log(`wrote ${object} (${Array.isArray(data) ? data.length : '?'} items)`);
};

const groups = read('data/groups.json');
const farms = read('data/farms.geojson'); // raw FeatureCollection

await upload('groups.json', groups);
await upload('farms.geojson', farms);
console.log('done.');

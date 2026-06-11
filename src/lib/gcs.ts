import { Storage } from '@google-cloud/storage';

// User-submitted groups and farms are stored as JSON arrays in a GCS bucket.
// Configure with:
//   GCS_BUCKET                  (required) the bucket name
//   GCS_PROJECT_ID              (optional) GCP project id
//   GCS_SERVICE_ACCOUNT_KEY     (optional) the service-account JSON, inline
//   GOOGLE_APPLICATION_CREDENTIALS  (optional) path to a key file (ADC)
// If neither credential is set, Application Default Credentials are used.

const bucketName = process.env.GCS_BUCKET;

// Canonical base data lives in the bucket as the raw source files; the API
// enriches farms (district/catchment) on the fly at read time.
export const GROUPS_OBJECT = 'groups.json'; // base groups + user-added
export const RAW_FARMS_OBJECT = 'farms.geojson'; // raw base FeatureCollection
export const ADDED_FARMS_OBJECT = 'farms-added.json'; // user-added farm features

let storage: Storage | null = null;

const getStorage = (): Storage => {
  if (storage) return storage;
  const projectId = process.env.GCS_PROJECT_ID;
  const key = process.env.GCS_SERVICE_ACCOUNT_KEY?.trim();

  if (key?.startsWith('{')) {
    // Inline service-account JSON.
    const credentials = JSON.parse(key);
    storage = new Storage({ projectId: credentials.project_id ?? projectId, credentials });
  } else if (key) {
    // A path to a key file was put in GCS_SERVICE_ACCOUNT_KEY.
    storage = new Storage({ keyFilename: key, projectId });
  } else {
    // GOOGLE_APPLICATION_CREDENTIALS / Application Default Credentials.
    storage = new Storage({ projectId });
  }
  return storage;
};

/** Whether a bucket is configured — routes return 503 when it isn't. */
export const gcsConfigured = (): boolean => Boolean(bucketName);

/** Read a JSON object, returning null if it doesn't exist yet. */
export const readJson = async <T>(object: string): Promise<T | null> => {
  if (!bucketName) throw new Error('GCS_BUCKET is not configured');
  const file = getStorage().bucket(bucketName).file(object);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return JSON.parse(buf.toString('utf8')) as T;
};

/** Read a JSON array object, returning [] if it doesn't exist yet. */
export const readJsonArray = async <T>(object: string): Promise<T[]> =>
  (await readJson<T[]>(object)) ?? [];

/** Overwrite a JSON object. */
export const writeJson = async (object: string, data: unknown): Promise<void> => {
  if (!bucketName) throw new Error('GCS_BUCKET is not configured');
  const file = getStorage().bucket(bucketName).file(object);
  await file.save(JSON.stringify(data, null, 2), {
    contentType: 'application/json',
    resumable: false,
  });
};

/** Append one item to a JSON-array object (read-modify-write). */
export const appendJson = async <T>(object: string, item: T): Promise<T[]> => {
  const items = await readJsonArray<T>(object);
  items.push(item);
  await writeJson(object, items);
  return items;
};

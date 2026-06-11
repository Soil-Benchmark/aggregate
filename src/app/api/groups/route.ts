import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { appendJson, gcsConfigured, GROUPS_OBJECT } from '@/lib/gcs';

export const runtime = 'nodejs';

type GroupBody = {
  name?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  labels?: unknown;
};

export async function POST(req: Request) {
  if (!gcsConfigured()) {
    return NextResponse.json(
      { error: 'Storage is not configured yet (set GCS_BUCKET).' },
      { status: 503 },
    );
  }

  let body: GroupBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  const contactName = body.contactName?.trim();
  const contactEmail = body.contactEmail?.trim();
  if (!name || !contactName || !contactEmail) {
    return NextResponse.json(
      { error: 'name, contactName and contactEmail are required' },
      { status: 400 },
    );
  }

  const group = {
    groupId: randomUUID(),
    name,
    description: body.description?.trim() ?? '',
    contactName,
    contactEmail,
    labels: Array.isArray(body.labels) ? body.labels.map(String) : [],
  };

  try {
    await appendJson(GROUPS_OBJECT, group);
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save group', detail: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ group }, { status: 201 });
}

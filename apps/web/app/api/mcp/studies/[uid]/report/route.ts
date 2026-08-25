import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

// POST — accepts multipart/form-data (field `file` OR `text`) from the browser
// and forwards it verbatim to the bridge.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const contentType = req.headers.get('content-type') ?? '';
  const body = await req.arrayBuffer();
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}/report`, {
    method: 'POST',
    headers: contentType ? { 'Content-Type': contentType } : {},
    body,
    signal: AbortSignal.timeout(60_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

// GET — list all patient-report attachments for a study.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}/reports`, {
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

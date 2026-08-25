import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  // Forward multipart body as-is (browser sets Content-Type header)
  const contentType = req.headers.get('content-type') ?? 'multipart/form-data';
  const body = await req.arrayBuffer();
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}/intake`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
    timeoutMs: 300_000,
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

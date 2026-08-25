import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const body = await req.arrayBuffer();
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}/dicom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}/dicom`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    return new NextResponse('Not found', { status: r.status });
  }
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/dicom',
      'Content-Disposition': `attachment; filename="${uid}.dcm"`,
    },
  });
}

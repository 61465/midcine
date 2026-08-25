import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ uid: string; fname: string }> },
) {
  const { uid, fname } = await params;
  const body = await req.arrayBuffer();
  const r = await bridgeFetch(
    `/studies/${encodeURIComponent(uid)}/series/${encodeURIComponent(fname)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
      timeoutMs: 60_000,
    },
  );
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string; fname: string }> },
) {
  const { uid, fname } = await params;
  const url = new URL(req.url);
  const wrap = url.searchParams.get('wrap') === '1' ? '?wrap=1' : '';
  const r = await bridgeFetch(
    `/studies/${encodeURIComponent(uid)}/series/${encodeURIComponent(fname)}${wrap}`,
    { timeoutMs: 30_000 },
  );
  if (!r.ok) return new NextResponse('Not found', { status: r.status });
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: { 'Content-Type': 'application/dicom' },
  });
}

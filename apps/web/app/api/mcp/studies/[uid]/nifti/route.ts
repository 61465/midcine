import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const url = new URL(req.url);
  const sid = url.searchParams.get('series_uid');
  const qs = sid ? `?series_uid=${encodeURIComponent(sid)}` : '';
  const r = await bridgeFetch(
    `/studies/${encodeURIComponent(uid)}/nifti${qs}`,
    { timeoutMs: 120_000 },
  );
  if (!r.ok) {
    const text = await r.text();
    return new NextResponse(text, { status: r.status });
  }
  const buf = await r.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Catch-all for /nifti/<anything>.nii.gz — NiiVue infers format from the
// URL extension, so the client appends "volume.nii.gz". We ignore the
// filename and forward to the same bridge endpoint.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ uid: string; fname: string }> },
) {
  const { uid } = await params;
  const url = new URL(req.url);
  // Accept series UID from either query string (legacy) or header (preferred:
  // avoids polluting the URL with dots that break NiiVue's extension parser).
  const sid = url.searchParams.get('series_uid') || req.headers.get('x-series-uid');
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

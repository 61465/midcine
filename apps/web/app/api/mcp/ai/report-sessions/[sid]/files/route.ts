import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { sid } = await params;
  const contentType = req.headers.get('content-type') ?? '';
  const body = await req.arrayBuffer();
  try {
    const r = await bridgeFetch(
      `/ai/report-sessions/${encodeURIComponent(sid)}/files`,
      {
        method: 'POST',
        headers: contentType ? { 'Content-Type': contentType } : {},
        body,
        signal: AbortSignal.timeout(180_000),
      },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Bridge unreachable: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

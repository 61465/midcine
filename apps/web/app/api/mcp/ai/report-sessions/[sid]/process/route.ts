import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { sid } = await params;
  const contentType = req.headers.get('content-type') ?? '';
  const body = await req.arrayBuffer();
  try {
    const r = await bridgeFetch(
      `/ai/report-sessions/${encodeURIComponent(sid)}/process`,
      {
        method: 'POST',
        headers: contentType ? { 'Content-Type': contentType } : {},
        body,
        // Extract+compose over many chunks can take several minutes
        signal: AbortSignal.timeout(600_000),
      },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort
          ? 'Processing timed out. The AI may still finish — reload the session in a moment.'
          : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

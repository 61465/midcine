import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    // 3 NEXUS agents run in parallel; typical latency 30-90s.
    const r = await bridgeFetch('/ai/second-opinion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(290_000),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort ? 'Second-opinion timed out.' : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

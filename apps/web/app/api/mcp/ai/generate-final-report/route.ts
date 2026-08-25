import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const r = await bridgeFetch('/ai/generate-final-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(600_000),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort
          ? 'Generation timed out (10 min limit). Try a smaller study.'
          : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

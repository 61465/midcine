import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    // Story generation may lazily run full-volume vision analysis (up to
    // ~3 min on a 150-slice study). Match the vision-see-full timeout.
    const r = await bridgeFetch('/ai/case-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(590_000),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    const err = e as Error;
    const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort
          ? 'Story generation timed out. Try again.'
          : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

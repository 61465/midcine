import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    // Full-volume vision for a 150+ slice study can take 60-180s; a slow
    // Groq backend + retries push worst-case beyond the old 240s cap.
    // Match the ceiling used by /ai/vision-see-full.
    const r = await bridgeFetch('/ai/analyze-study', {
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
        error: isAbort ? 'Analyze timed out — try again.' : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.text();
  try {
    const r = await bridgeFetch('/ai/vision-see-region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { ok: false, error: `Bridge unreachable: ${err.message}` },
      { status: 502 },
    );
  }
}

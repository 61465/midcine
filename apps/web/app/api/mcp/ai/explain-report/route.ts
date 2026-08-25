import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  const body = await req.text();
  const r = await bridgeFetch('/ai/explain-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

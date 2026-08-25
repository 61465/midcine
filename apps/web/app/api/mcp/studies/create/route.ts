import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  // CRITICAL: use arrayBuffer + explicit UTF-8 decode.
  // `req.text()` in Node applies Latin-1 to raw bytes for non-form content when
  // charset is missing, corrupting Arabic/non-Latin characters.
  const buf = await req.arrayBuffer();
  const body = new TextDecoder('utf-8').decode(buf);
  const r = await bridgeFetch(`/studies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  const _buf = await req.arrayBuffer();
  const body = new TextDecoder("utf-8").decode(_buf);
  const r = await bridgeFetch(`/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

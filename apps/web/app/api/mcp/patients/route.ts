import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  const _buf = await req.arrayBuffer();
  const body = new TextDecoder("utf-8").decode(_buf);
  const r = await bridgeFetch(`/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const r = await bridgeFetch(`/patients${q ? `?${q}` : ''}`, {
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

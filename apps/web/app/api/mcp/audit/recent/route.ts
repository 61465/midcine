import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const r = await bridgeFetch(`/audit/recent?${qs}`, {
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

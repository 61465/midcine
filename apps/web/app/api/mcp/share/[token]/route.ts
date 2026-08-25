import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await bridgeFetch(`/share/${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

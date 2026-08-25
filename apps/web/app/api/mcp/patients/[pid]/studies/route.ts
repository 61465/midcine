import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function GET(_req: Request, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const r = await bridgeFetch(`/patients/${encodeURIComponent(pid)}/studies`, {
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

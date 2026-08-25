import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { sid } = await params;
  const r = await bridgeFetch(`/ai/report-sessions/${encodeURIComponent(sid)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { sid } = await params;
  const r = await bridgeFetch(`/ai/report-sessions/${encodeURIComponent(sid)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

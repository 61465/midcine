import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const r = await bridgeFetch(`/ai/style/profile/${encodeURIComponent(uid)}`, {
    signal: AbortSignal.timeout(120_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

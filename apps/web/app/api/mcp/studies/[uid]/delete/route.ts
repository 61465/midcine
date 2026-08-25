import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  const r = await bridgeFetch(`/studies/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

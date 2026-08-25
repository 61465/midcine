import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../../lib/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string; sid: string }> },
) {
  const { uid, sid } = await params;
  const r = await bridgeFetch(
    `/studies/${encodeURIComponent(uid)}/series/group/${encodeURIComponent(sid)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  return NextResponse.json(await r.json(), { status: r.status });
}

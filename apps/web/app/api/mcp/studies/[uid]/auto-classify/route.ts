import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  try {
    const r = await bridgeFetch(
      `/studies/${encodeURIComponent(uid)}/auto-classify`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
      },
    );
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Bridge unreachable: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

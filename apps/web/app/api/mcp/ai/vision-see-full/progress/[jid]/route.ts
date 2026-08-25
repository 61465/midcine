import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jid: string }> },
) {
  const { jid } = await params;
  const r = await bridgeFetch(
    `/ai/vision-see-full/progress/${encodeURIComponent(jid)}`,
    { timeoutMs: 8_000 },
  );
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

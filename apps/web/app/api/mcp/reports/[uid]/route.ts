import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const r = await fetch(`${BRIDGE_URL}/reports/${encodeURIComponent(uid)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    return new Response('Report not found', { status: r.status });
  }
  return NextResponse.json(await r.json());
}

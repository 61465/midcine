import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await fetch(`${BRIDGE_URL}/share/${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

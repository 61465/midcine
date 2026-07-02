import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function POST(req: Request) {
  const body = await req.text();
  const r = await fetch(`${BRIDGE_URL}/report/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

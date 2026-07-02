import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const r = await fetch(`${BRIDGE_URL}/studies?${qs}`, { signal: AbortSignal.timeout(10_000) });
  return NextResponse.json(await r.json(), { status: r.status });
}

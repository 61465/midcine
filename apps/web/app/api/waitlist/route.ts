import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function POST(req: Request) {
  const body = await req.text();
  const r = await fetch(`${BRIDGE_URL}/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

export async function GET() {
  const r = await fetch(`${BRIDGE_URL}/waitlist/count`, {
    signal: AbortSignal.timeout(10_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

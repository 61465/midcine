import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hospital_id = url.searchParams.get('hospital_id') ?? '';
  const limit = url.searchParams.get('limit') ?? '50';
  const r = await fetch(
    `${BRIDGE_URL}/whatsapp/messages?hospital_id=${encodeURIComponent(hospital_id)}&limit=${encodeURIComponent(limit)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  return NextResponse.json(await r.json(), { status: r.status });
}

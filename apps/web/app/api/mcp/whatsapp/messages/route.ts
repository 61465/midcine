import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hospital_id = url.searchParams.get('hospital_id') ?? '';
  const limit = url.searchParams.get('limit') ?? '50';
  const r = await bridgeFetch(
    `/whatsapp/messages?hospital_id=${encodeURIComponent(hospital_id)}&limit=${encodeURIComponent(limit)}`,
    { timeoutMs: 10_000 },
  );
  return NextResponse.json(await r.json(), { status: r.status });
}

import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tid: string }> },
) {
  const { tid } = await params;
  const r = await bridgeFetch(`/templates/${encodeURIComponent(tid)}`, {
    signal: AbortSignal.timeout(20_000),
  });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET() {
  const r = await bridgeFetch(`/templates/index`, {
    signal: AbortSignal.timeout(30_000),
  });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

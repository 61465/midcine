import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.search;
  const r = await bridgeFetch(`/templates/browse${q}`, {
    signal: AbortSignal.timeout(20_000),
  });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

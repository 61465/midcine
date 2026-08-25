import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  const _buf = await req.arrayBuffer();
  const body = new TextDecoder('utf-8').decode(_buf);
  const r = await bridgeFetch(`/ai/gaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const buf = await r.arrayBuffer();
  return new Response(buf, {
    status: r.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

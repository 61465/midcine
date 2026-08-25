// SSE proxy to bridge /pipeline/stream. Streams agent-by-agent AI results.
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function POST(req: Request) {
  const _buf = await req.arrayBuffer();
  const body = new TextDecoder("utf-8").decode(_buf);
  const upstream = await bridgeFetch(`/pipeline/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // No timeout — SSE stream is long-lived. Client aborts if needed.
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`bridge error ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

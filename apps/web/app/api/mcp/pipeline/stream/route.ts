// SSE proxy to bridge /pipeline/stream. Streams agent-by-agent AI results.

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(`${BRIDGE_URL}/pipeline/stream`, {
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

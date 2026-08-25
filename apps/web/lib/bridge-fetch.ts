// Server-side helper for Next.js API routes → bridge.
// Handles: token forwarding + timeout + JSON convenience.

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';
const BRIDGE_TOKEN = process.env.MIDCINE_BRIDGE_TOKEN ?? '';

type Init = {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function bridgeFetch(path: string, init: Init = {}): Promise<Response> {
  const url = `${BRIDGE_URL}${path.startsWith('/') ? path : '/' + path}`;
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (BRIDGE_TOKEN) headers['X-Midcine-Token'] = BRIDGE_TOKEN;
  const signal = init.signal ?? AbortSignal.timeout(init.timeoutMs ?? 30_000);
  return fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ?? null,
    signal,
  });
}

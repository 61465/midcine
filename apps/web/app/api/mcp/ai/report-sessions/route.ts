import { NextResponse } from 'next/server';
import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Bytes → readable string for logs
function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

// POST — multipart form (files[] + optional text/title). Long-running: extract + compose ≈ up to 90s.
// Buffered forwarding (proxy-side): we accept the client's whole body, then POST
// it to the bridge with a proper Content-Length. This is more compatible with
// intermediary proxies (Tailscale Funnel) than streaming with duplex:'half'.
export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  const t0 = Date.now();
  const label = `[report-sessions POST ${new Date().toISOString()}]`;

  let body: ArrayBuffer;
  try {
    body = await req.arrayBuffer();
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error(`${label} failed to read request body:`, msg);
    return NextResponse.json(
      { ok: false, error: `Upload interrupted while reading client body: ${msg}` },
      { status: 400 },
    );
  }

  console.log(
    `${label} received ${fmtSize(body.byteLength)} content-type="${contentType}" in ${
      Date.now() - t0
    }ms`,
  );

  try {
    const r = await bridgeFetch('/ai/report-sessions', {
      method: 'POST',
      headers: contentType ? { 'Content-Type': contentType } : {},
      body,
      signal: AbortSignal.timeout(240_000),
    });
    console.log(`${label} bridge responded ${r.status} in ${Date.now() - t0}ms`);
    // Bridge always returns JSON here; if it didn't, surface a useful message.
    const raw = await r.text();
    try {
      const j = JSON.parse(raw);
      return NextResponse.json(j, { status: r.status });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: `Bridge returned non-JSON (HTTP ${r.status}): ${raw.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }
  } catch (e) {
    const err = e as Error;
    console.error(`${label} bridge call failed:`, err.name, err.message);
    const isAbort = err.name === 'AbortError' || err.name === 'TimeoutError';
    return NextResponse.json(
      {
        ok: false,
        error: isAbort
          ? 'Bridge timed out after 4 minutes. The AI may still finish — check the reports list shortly.'
          : `Bridge unreachable: ${err.message}`,
      },
      { status: isAbort ? 504 : 502 },
    );
  }
}

// GET — list recent sessions
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.search ? url.search : '';
  const r = await bridgeFetch(`/ai/report-sessions${qs}`, {
    signal: AbortSignal.timeout(15_000),
  });
  return NextResponse.json(await r.json(), { status: r.status });
}

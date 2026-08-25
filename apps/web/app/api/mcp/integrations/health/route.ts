import { bridgeFetch } from '../../../../../lib/bridge-fetch';

export async function GET() {
  try {
    const r = await bridgeFetch(`/integrations/health`, {
      signal: AbortSignal.timeout(20_000),
    });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: r.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e: unknown) {
    // Graceful degradation — never 500 for a health check
    return new Response(
      JSON.stringify({
        naraya: { connected: false, hint: 'health check timed out' },
        orthanc: { connected: false, hint: 'not connected' },
        hl7_ris: { connected: false, hint: 'not connected' },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}

import { bridgeFetch } from '../../../../../../lib/bridge-fetch';

export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const r = await bridgeFetch(`/reports/${encodeURIComponent(uid)}/pdf`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    return new Response('Report not found', { status: r.status });
  }
  const bytes = await r.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-${uid.slice(-12)}.pdf"`,
    },
  });
}

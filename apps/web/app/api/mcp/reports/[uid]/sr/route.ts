const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

export async function GET(_req: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const r = await fetch(`${BRIDGE_URL}/reports/${encodeURIComponent(uid)}/sr`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) {
    return new Response('Report not found', { status: r.status });
  }
  const bytes = await r.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/dicom',
      'Content-Disposition': `attachment; filename="report-${uid.slice(-12)}.dcm"`,
    },
  });
}

import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210';

interface Body {
  study: {
    study_uid: string;
    modality: string;
    body_part: string;
    patient_id?: string;
    patient_name?: string;
    clinical_context?: string;
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  try {
    const r = await fetch(`${BRIDGE_URL}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: 'bridge_error', status: r.status, detail: text.slice(0, 500) },
        { status: 502 },
      );
    }
    const data = await r.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'bridge_unreachable', detail: String(e).slice(0, 300) },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const r = await fetch(`${BRIDGE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return NextResponse.json(await r.json(), { status: r.ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json({ error: 'bridge_unreachable' }, { status: 502 });
  }
}

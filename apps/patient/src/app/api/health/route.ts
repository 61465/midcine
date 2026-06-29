import { NextResponse } from 'next/server';
export const dynamic = 'force-static';
export function GET() {
  return NextResponse.json({ status: 'ok', app: 'patient', timestamp: new Date().toISOString() });
}

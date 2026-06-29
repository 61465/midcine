import { NextResponse } from 'next/server';
export const dynamic = 'force-static';
export function GET() {
  return NextResponse.json({ status: 'ok', app: 'connect', timestamp: new Date().toISOString() });
}

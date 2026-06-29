import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'worklist',
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

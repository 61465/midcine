import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'reader',
    version: process.env.npm_package_version ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}

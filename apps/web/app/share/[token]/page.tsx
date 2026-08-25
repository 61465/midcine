import Link from 'next/link';
import { FileText, ScanEye, Download, AlertTriangle, Clock, ExternalLink } from 'lucide-react';

interface SharePayload {
  ok: boolean;
  study_uid?: string;
  kind?: 'pdf' | 'viewer' | 'sr';
  recipient?: string;
  expires_at?: number;
  error?: string;
}

async function resolveToken(token: string): Promise<SharePayload> {
  const url = `${process.env.MCP_BRIDGE_URL ?? 'http://localhost:8210'}/share/${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, error: `bridge ${r.status}` };
    return (await r.json()) as SharePayload;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function formatExpiry(exp?: number): string {
  if (!exp) return '';
  const d = new Date(exp * 1000);
  const diffDays = Math.round((d.getTime() - Date.now()) / (24 * 3600 * 1000));
  const dateStr = d.toLocaleDateString('en-US');
  return `${dateStr} (${diffDays} day${diffDays === 1 ? '' : 's'} remaining)`;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await resolveToken(token);

  if (!payload.ok || !payload.study_uid || !payload.kind) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-8">
        <div className="card-luxury border-rose-200 bg-rose-50 p-6">
          <div className="mb-3 flex items-center gap-2 text-rose-800">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="text-xl font-bold">Invalid link</h1>
          </div>
          <p className="text-sm text-rose-900">
            This link has expired, been modified, or was not issued by midcine.
            <br />
            <span className="mt-2 block text-[11px] text-rose-700">
              {payload.error ?? 'token verify failed'}
            </span>
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1 rounded-full bg-slate-800 px-4 py-1.5 text-xs font-bold text-white"
          >
            Home
          </Link>
        </div>
      </div>
    );
  }

  const { study_uid, kind, expires_at } = payload;
  const pdfUrl = `/api/mcp/reports/${encodeURIComponent(study_uid)}/pdf`;
  const srUrl = `/api/mcp/reports/${encodeURIComponent(study_uid)}/sr`;
  const readerUrl = `/reader/${encodeURIComponent(study_uid)}`;

  if (kind === 'viewer') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Header studyUid={study_uid} expires_at={expires_at} />
        <div className="card-luxury p-6 text-center">
          <ScanEye className="mx-auto mb-3 h-10 w-10 text-cyan-500" />
          <div className="text-brand-800 mb-2 text-xl font-bold">DICOM Viewer</div>
          <p className="mb-4 text-sm text-slate-600">
            Opens the DICOM viewer with measurement tools, window/level, and multi-slice
            scrolling.
          </p>
          <Link href={readerUrl} className="btn-luxury inline-flex items-center gap-2 px-6 py-2">
            <ScanEye className="h-4 w-4" />
            Open viewer
          </Link>
        </div>
      </div>
    );
  }

  if (kind === 'sr') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Header studyUid={study_uid} expires_at={expires_at} />
        <div className="card-luxury p-6 text-center">
          <Download className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <div className="text-brand-800 mb-2 text-xl font-bold">DICOM Structured Report</div>
          <p className="mb-4 text-sm text-slate-600">
            <code className="rounded bg-slate-100 px-1">.dcm</code> file that can be imported
            into any DICOM-compatible PACS. Size ~4 KB.
          </p>
          <a href={srUrl} className="btn-luxury inline-flex items-center gap-2 px-6 py-2" download>
            <Download className="h-4 w-4" />
            Download SR
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Header studyUid={study_uid} expires_at={expires_at} />
      <div className="card-luxury overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="text-brand-800 flex items-center gap-2 text-sm font-bold">
            <FileText className="h-4 w-4" />
            Radiology report (PDF)
          </div>
          <a
            href={pdfUrl}
            className="bg-brand-800 hover:bg-brand-700 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold text-white"
            download
          >
            <Download className="h-3 w-3" />
            Download
          </a>
        </div>
        <iframe src={pdfUrl} className="h-[80vh] w-full border-0 bg-slate-100" title="Report PDF" />
      </div>
    </div>
  );
}

function Header({ studyUid, expires_at }: { studyUid: string; expires_at?: number }) {
  return (
    <div className="card-luxury flex flex-wrap items-center justify-between gap-3 p-3">
      <div>
        <div className="text-xs uppercase tracking-widest text-slate-500">
          midcine · shared link
        </div>
        <div className="mt-1 text-xs text-slate-700">{studyUid}</div>
      </div>
      <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] text-slate-600">
        <Clock className="h-3 w-3" />
        Valid until {formatExpiry(expires_at)}
      </div>
      <Link
        href="/"
        className="hover:text-brand-800 flex items-center gap-1 text-[10px] text-slate-500"
      >
        midcine.io <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  PenLine,
  Send,
  Printer,
  Save,
  RefreshCw,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { PipelineResponse, StudyMetadata } from '../../../lib/mcp';
import {
  generateReport,
  signReport,
  sendReportOnWhatsApp,
  type FinalReport,
  type ReportSection,
} from '../../../lib/report';

interface Props {
  study: StudyMetadata;
  pipeline: PipelineResponse;
  onSigned?: (report: FinalReport) => void;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; msg: string }
  | { status: 'ready'; report: FinalReport };

const SECTION_ORDER: ReportSection['key'][] = [
  'patient',
  'technique',
  'findings',
  'impression',
  'recommendations',
];

const STORAGE_KEY = (uid: string) => `midcine.report.${uid}`;

function loadDraft(uid: string): Partial<Record<ReportSection['key'], string>> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(uid));
    return raw ? (JSON.parse(raw) as Record<ReportSection['key'], string>) : null;
  } catch {
    return null;
  }
}

function saveDraft(uid: string, sections: ReportSection[]) {
  if (typeof window === 'undefined') return;
  const map: Partial<Record<ReportSection['key'], string>> = {};
  for (const s of sections) map[s.key] = s.content_ar;
  window.localStorage.setItem(STORAGE_KEY(uid), JSON.stringify(map));
}

export function ReportEditor({ study, pipeline, onSigned }: Props) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [signOpen, setSignOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState<'doctor' | 'patient' | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // Auto-generate the draft once the pipeline is done.
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    generateReport(study, pipeline.aggregate, pipeline.outputs)
      .then((rpt) => {
        if (cancelled) return;
        // Merge in any saved draft edits
        const draft = loadDraft(study.study_uid);
        if (draft) {
          rpt.sections = rpt.sections.map((s) =>
            draft[s.key] != null ? { ...s, content_ar: draft[s.key]! } : s,
          );
        }
        setState({ status: 'ready', report: rpt });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', msg: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [study.study_uid]);

  const report = state.status === 'ready' ? state.report : null;

  function updateSection(idx: number, next: string) {
    if (state.status !== 'ready') return;
    const sections = state.report.sections.slice();
    sections[idx] = { ...sections[idx]!, content_ar: next };
    const nextReport = { ...state.report, sections };
    setState({ status: 'ready', report: nextReport });
    saveDraft(study.study_uid, sections);
  }

  async function regenerate() {
    setState({ status: 'loading' });
    try {
      const rpt = await generateReport(study, pipeline.aggregate, pipeline.outputs);
      window.localStorage.removeItem(STORAGE_KEY(study.study_uid));
      setState({ status: 'ready', report: rpt });
    } catch (e) {
      setState({ status: 'error', msg: String(e) });
    }
  }

  const sectionsOrdered = useMemo(() => {
    if (!report) return [];
    const map = new Map(report.sections.map((s) => [s.key, s]));
    return SECTION_ORDER.map((k) => map.get(k)).filter((s): s is ReportSection => !!s);
  }, [report]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="card-luxury flex items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <div className="from-brand-800 flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br to-cyan-600 text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-brand-800 text-sm font-bold">مسودّة التقرير</div>
            <div className="text-muted-foreground text-[10px]">
              {report?.signed_by ? `موقّع من ${report.signed_by}` : 'يمكن تحرير أي قسم ثم التوقيع'}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={regenerate}
            className="border-border rounded-full border p-1.5 text-slate-500 hover:bg-slate-50"
            title="إعادة توليد من AI"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="card-luxury flex flex-1 flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
          <div className="text-xs">توليد مسودّة عربية…</div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="card-luxury flex-1 p-4 text-center text-sm text-rose-700">
          فشل توليد التقرير: <code className="ltr-only text-[10px]">{state.msg}</code>
        </div>
      )}

      {report && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {sectionsOrdered.map((s) => {
              const idx = report.sections.findIndex((x) => x.key === s.key);
              return (
                <div key={s.key} className="card-luxury">
                  <div className="border-border/40 flex items-center justify-between border-b px-3 py-2">
                    <div className="text-brand-800 text-xs font-bold">{s.title_ar}</div>
                    <div className="ltr-only text-[9px] text-slate-400">
                      {s.content_ar.length} حرف
                    </div>
                  </div>
                  {s.editable ? (
                    <textarea
                      dir="rtl"
                      value={s.content_ar}
                      onChange={(e) => updateSection(idx, e.target.value)}
                      disabled={!!report.signed_at}
                      className="min-h-[80px] w-full resize-y bg-transparent p-3 text-sm text-slate-800 focus:outline-none disabled:bg-slate-50"
                    />
                  ) : (
                    <div className="whitespace-pre-wrap p-3 text-sm text-slate-800">
                      {s.content_ar}
                    </div>
                  )}
                </div>
              );
            })}

            {report.signed_at && (
              <div className="card-luxury border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  تم التوقيع
                </div>
                <div className="text-xs text-emerald-900">
                  {report.signed_by} · ترخيص {report.license_no} ·{' '}
                  {new Date(report.signed_at).toLocaleString('ar-EG')}
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="card-luxury flex flex-wrap gap-2 p-3">
            <button
              type="button"
              onClick={() => saveDraft(study.study_uid, report.sections)}
              className="border-border inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              disabled={!!report.signed_at}
            >
              <Save className="h-3 w-3" />
              حفظ مسودة
            </button>
            <button
              type="button"
              onClick={() => setPrintOpen(true)}
              className="border-border inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-3 w-3" />
              مطبوعة للمريض
            </button>
            {!report.signed_at ? (
              <button
                type="button"
                onClick={() => setSignOpen(true)}
                className="btn-luxury ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs"
              >
                <PenLine className="h-3 w-3" />
                توقيع
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSendOpen('doctor')}
                  className="btn-luxury ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs"
                >
                  <Send className="h-3 w-3" />
                  إرسال للطبيب المُحيل
                </button>
                <button
                  type="button"
                  onClick={() => setSendOpen('patient')}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  <Send className="h-3 w-3" />
                  إرسال للمريض
                </button>
              </>
            )}
          </div>
        </>
      )}

      {signOpen && report && (
        <SignDialog
          report={report}
          onClose={() => setSignOpen(false)}
          onSigned={(signed) => {
            setState({ status: 'ready', report: signed });
            setSignOpen(false);
            onSigned?.(signed);
          }}
        />
      )}

      {sendOpen && report && (
        <SendDialog
          report={report}
          kind={sendOpen === 'doctor' ? 'report_to_doctor' : 'report_to_patient'}
          onClose={() => setSendOpen(null)}
        />
      )}

      {printOpen && report && (
        <PrintPreview report={report} study={study} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  );
}

function SignDialog({
  report,
  onClose,
  onSigned,
}: {
  report: FinalReport;
  onClose: () => void;
  onSigned: (r: FinalReport) => void;
}) {
  const [name, setName] = useState('د. أحمد الشمري');
  const [license, setLicense] = useState('EG-RAD-4821');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doSign() {
    setBusy(true);
    setErr(null);
    try {
      const signed = await signReport(report, name, license);
      onSigned(signed);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <PenLine className="text-brand-800 h-4 w-4" />
          <h3 className="text-brand-800 text-lg font-bold">توقيع التقرير</h3>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          التوقيع نهائي — لن يمكن تعديل الأقسام بعد التوقيع.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">اسم الطبيب</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-cyan-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">رقم الترخيص</label>
            <input
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              dir="ltr"
              className="ltr-only w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>
        {err && <div className="mt-2 text-xs text-rose-700">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border rounded-lg border px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={doSign}
            disabled={busy || !name || !license}
            className="btn-luxury inline-flex items-center gap-1 px-4 py-1.5 text-xs disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
            توقيع الآن
          </button>
        </div>
      </div>
    </div>
  );
}

function SendDialog({
  report,
  kind,
  onClose,
}: {
  report: FinalReport;
  kind: 'report_to_doctor' | 'report_to_patient';
  onClose: () => void;
}) {
  const [phone, setPhone] = useState('+201002233445');
  const [name, setName] = useState(
    kind === 'report_to_doctor' ? 'د. محمد حسن' : (report.patient_name ?? ''),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function doSend() {
    setBusy(true);
    setErr(null);
    try {
      const msg = await sendReportOnWhatsApp(report, phone, name, kind);
      setDone(`تم الإرسال بنجاح — الحالة: ${msg.status}`);
      setTimeout(onClose, 1500);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-emerald-600" />
          <h3 className="text-brand-800 text-lg font-bold">
            إرسال عبر WhatsApp — {kind === 'report_to_doctor' ? 'الطبيب المُحيل' : 'المريض'}
          </h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">الاسم</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">رقم WhatsApp</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="+201000000000"
              className="ltr-only w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        {done && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-800">
            {done}
          </div>
        )}
        {err && <div className="mt-2 text-xs text-rose-700">{err}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border rounded-lg border px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={doSend}
            disabled={busy || !phone || !name}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            إرسال
          </button>
        </div>
      </div>
    </div>
  );
}

function PrintPreview({
  report,
  study,
  onClose,
}: {
  report: FinalReport;
  study: StudyMetadata;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-brand-800 text-sm font-bold">معاينة الطباعة للمريض</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-luxury inline-flex items-center gap-1 px-3 py-1 text-xs"
            >
              <Printer className="h-3 w-3" /> طباعة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border-border rounded-lg border px-3 py-1 text-xs"
            >
              إغلاق
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6" id="print-area">
          <div className="mx-auto max-w-2xl">
            <div className="border-brand-800 mb-4 flex items-baseline justify-between border-b-2 pb-3">
              <div>
                <div className="text-brand-800 text-2xl font-black">midcine</div>
                <div className="text-xs text-slate-500">تقرير أشعة رسمي</div>
              </div>
              <div className="text-xs text-slate-600">
                {new Date(report.generated_at).toLocaleDateString('ar-EG')}
              </div>
            </div>

            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <b>المريض:</b> {report.patient_name ?? '—'}
                </div>
                <div className="ltr-only">
                  <b>ID:</b> {report.patient_id ?? '—'}
                </div>
                <div>
                  <b>نوع الفحص:</b> {study.modality}
                </div>
                <div>
                  <b>المنطقة:</b> {study.body_part}
                </div>
              </div>
            </div>

            {report.sections.map((s) => (
              <div key={s.key} className="mb-4">
                <h3 className="text-brand-800 mb-1 border-b border-slate-200 pb-1 text-sm font-bold">
                  {s.title_ar}
                </h3>
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                  {s.content_ar}
                </div>
              </div>
            ))}

            {report.signed_by && (
              <div className="border-brand-800 mt-6 border-t-2 pt-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <b>الطبيب:</b> {report.signed_by}
                  </div>
                  <div className="ltr-only">
                    <b>الترخيص:</b> {report.license_no}
                  </div>
                  <div className="col-span-2">
                    <b>تاريخ التوقيع:</b> {new Date(report.signed_at!).toLocaleString('ar-EG')}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 text-center text-[10px] text-slate-400">
              هذا التقرير تم إنشاؤه بمساعدة NEXUS AI Ensemble ومراجعته من قِبل طبيب مختص.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Home,
  Sparkles,
  HelpCircle,
  Plus,
  FileUp,
  User,
  BarChart3,
  BookOpen,
  Shield,
  Menu,
  FileText,
  X,
  Stethoscope,
  Paperclip,
} from 'lucide-react';
import { WorklistRail } from './worklist-rail';
import { AddCaseDialog } from './add-case-dialog';
import { ReportComposer } from './report-composer';
import { useTabletLayout } from './use-tablet-layout';
import { PatientIntakeDialog } from './patient-intake-dialog';
import { SmartReportDialog } from './smart-report-dialog';
import { PatientReportDialog } from './patient-report-dialog';
import { TriplanarViewerModal } from './triplanar-viewer-modal';
import { SavingsCounter } from './savings-counter';
import { RoomShortcuts } from './room-shortcuts';
import { HelpOverlay } from './help-overlay';
import { TrialBanner } from '../auth/trial-banner';
import { DicomViewer } from '../dicom-viewer-loader';
import { fetchStudies, type Study } from '../../../lib/studies';
import type { StudyMetadata } from '../../../lib/mcp';

function studyToMeta(s: Study): StudyMetadata {
  const context = [
    s.symptoms ? `Symptoms: ${s.symptoms}` : '',
    s.clinical_history ? `History: ${s.clinical_history}` : '',
    s.description ? `Study: ${s.description}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    study_uid: s.study_uid,
    modality: s.modality,
    body_part: s.body_part,
    patient_id: s.patient_id,
    patient_name: s.patient_name,
    clinical_context: context,
    hospital_id: s.hospital_id,
  };
}

export function ReadingRoom() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [worklistCollapsed, setWorklistCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [smartReportOpen, setSmartReportOpen] = useState(false);
  const [patientReportOpen, setPatientReportOpen] = useState(false);
  const [triplanarOpen, setTriplanarOpen] = useState(false);
  const [totalSlices, setTotalSlices] = useState(0);
  // router removed with voice commands

  const {
    isTabletPortrait,
    isTablet,
    worklistOpen,
    setWorklistOpen,
    reportOpen,
    setReportOpen,
  } = useTabletLayout();

  const reload = useCallback(async (selectUid?: string) => {
    const all = await fetchStudies();
    setStudies(all);
    if (selectUid) setActiveUid(selectUid);
    else if (all.length > 0) setActiveUid((cur) => cur ?? all[0]!.study_uid);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      setToast(detail.text);
      setTimeout(() => setToast(null), 3000);
    }
    window.addEventListener('midcine:toast', onToast);
    return () => window.removeEventListener('midcine:toast', onToast);
  }, []);

  const active = studies.find((s) => s.study_uid === activeUid) ?? null;

  const nextCase = useCallback(() => {
    if (!activeUid || studies.length === 0) return;
    const idx = studies.findIndex((s) => s.study_uid === activeUid);
    const next = studies[(idx + 1) % studies.length];
    if (next) setActiveUid(next.study_uid);
  }, [activeUid, studies]);

  const prevCase = useCallback(() => {
    if (!activeUid || studies.length === 0) return;
    const idx = studies.findIndex((s) => s.study_uid === activeUid);
    const prev = studies[(idx - 1 + studies.length) % studies.length];
    if (prev) setActiveUid(prev.study_uid);
  }, [activeUid, studies]);

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0A0E14] text-slate-200" dir="ltr">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-3 py-2">
        <div className="flex items-center gap-2">
          {/* Tablet-only worklist drawer toggle */}
          {isTabletPortrait && (
            <button
              type="button"
              onClick={() => setWorklistOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Toggle worklist"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Link
            href="/"
            className="flex items-center gap-2 rounded p-1 hover:bg-slate-800"
            title="Home"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-cyan-500 to-cyan-700 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-black tracking-tight text-slate-200">midcine</span>
          </Link>
          <div className="hidden h-4 w-px bg-slate-800 sm:block" />
          <span className="hidden text-[10px] uppercase tracking-widest text-cyan-400 sm:inline">
            Reading Room
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TrialBanner />
          <SavingsCounter compact />
          {active && (
            <button
              type="button"
              onClick={() => setSmartReportOpen(true)}
              className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-1 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/35"
              title="Smart Report — pick a template + AI writes focused pathology report"
            >
              <FileText className="h-3 w-3" />
              Smart Report
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={() => setPatientReportOpen(true)}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
              title="Attach patient-brought report (referral / lab / prior imaging)"
            >
              <Paperclip className="h-3 w-3" />
              Attach report
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={() => setIntakeOpen(true)}
              className="flex items-center gap-1 rounded bg-gradient-to-r from-fuchsia-500/30 to-cyan-500/30 px-2 py-1 text-[10px] font-bold text-fuchsia-200 hover:from-fuchsia-500/50 hover:to-cyan-500/50"
              title="Upload full patient folder → AI diagnoses everything"
            >
              <Stethoscope className="h-3 w-3" />
              Full intake
            </button>
          )}
          {active && (
            <button
              type="button"
              onClick={async () => {
                // Fetch series count so the modal knows total slices
                try {
                  const r = await fetch(
                    `/api/mcp/studies/${encodeURIComponent(active.study_uid)}/series`,
                  );
                  const j = await r.json();
                  setTotalSlices(Array.isArray(j?.slices) ? j.slices.length : 0);
                } catch {
                  setTotalSlices(0);
                }
                setTriplanarOpen(true);
              }}
              className="flex items-center gap-1 rounded bg-gradient-to-r from-cyan-500/30 to-emerald-500/30 px-2 py-1 text-[10px] font-bold text-cyan-200 hover:from-cyan-500/50 hover:to-emerald-500/50"
              title="Open 3-plane synced viewer — click any point to AI-analyze it"
            >
              <Sparkles className="h-3 w-3" />
              Triplanar AI
            </button>
          )}
          {active && (
            <Link
              href={`/viewer/${encodeURIComponent(active.study_uid)}`}
              target="_blank"
              className="flex items-center gap-1 rounded bg-gradient-to-r from-emerald-500/30 to-teal-500/30 px-2 py-1 text-[10px] font-bold text-emerald-200 hover:from-emerald-500/50 hover:to-teal-500/50"
              title="Open Pro Viewer — MPR + 3D + AI per-slice warnings"
            >
              <Sparkles className="h-3 w-3" />
              Pro Viewer (MPR)
            </Link>
          )}
          {active && (
            <Link
              href={`/case-story/${encodeURIComponent(active.study_uid)}`}
              target="_blank"
              className="flex items-center gap-1 rounded bg-gradient-to-r from-purple-500/30 to-fuchsia-500/30 px-2 py-1 text-[10px] font-bold text-purple-200 hover:from-purple-500/50 hover:to-fuchsia-500/50"
              title="Open Case Story — full 3D reconstruction + patient-friendly narrated chapters + play mode"
            >
              <Sparkles className="h-3 w-3" />
              Case Story (3D)
            </Link>
          )}
          {active && (
            <Link
              href={`/patient/${encodeURIComponent(active.patient_id)}`}
              className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 hover:text-cyan-300"
              title="Open patient history"
            >
              <User className="h-3 w-3" />
              History
            </Link>
          )}
          <Link
            href="/reports"
            className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25"
            title="Reports library — 1200+ templates + attached study reports"
          >
            <BookOpen className="h-3 w-3" />
            Reports
          </Link>
          <Link
            href="/guide"
            target="_blank"
            className="flex items-center gap-1 rounded bg-cyan-500/15 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:bg-cyan-500/25"
            title="User Guide — how to use the platform + what files to upload + FAQ"
          >
            <HelpCircle className="h-3 w-3" />
            Guide
          </Link>
          <Link
            href="/analytics"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title="Analytics"
          >
            <BarChart3 className="h-4 w-4" />
          </Link>
          <Link
            href="/audit"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title="Audit log"
          >
            <Shield className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title="Shortcuts (?)"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <Link
            href="/"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            title="Home"
          >
            <Home className="h-4 w-4" />
          </Link>
          {/* Tablet-only report drawer toggle */}
          {isTabletPortrait && (
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
              aria-label="Toggle report"
            >
              <FileText className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main 3-column workspace */}
      <div className="relative flex min-h-0 flex-1">
        {/* Backdrop for tablet-portrait drawers */}
        {isTabletPortrait && (worklistOpen || reportOpen) && (
          <button
            type="button"
            aria-label="Close drawer"
            onClick={() => {
              setWorklistOpen(false);
              setReportOpen(false);
            }}
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm"
          />
        )}

        {/* Left: Worklist — desktop inline / tablet-landscape collapsed / portrait drawer */}
        <div
          className={
            'z-40 h-full flex-shrink-0 transition-transform duration-200 ' +
            (isTabletPortrait
              ? 'absolute inset-y-0 left-0 shadow-2xl ' +
                (worklistOpen ? 'translate-x-0' : '-translate-x-full')
              : '')
          }
        >
          <WorklistRail
            activeStudyUid={activeUid}
            onSelect={(uid) => {
              setActiveUid(uid);
              void reload(uid);
              if (isTabletPortrait) setWorklistOpen(false);
            }}
            collapsed={
              isTablet && !isTabletPortrait ? true : worklistCollapsed
            }
            onToggleCollapsed={() => setWorklistCollapsed((v) => !v)}
          />
        </div>
        {addOpen && (
          <AddCaseDialog
            onClose={() => setAddOpen(false)}
            onCreated={(uid) => {
              setAddOpen(false);
              void reload(uid);
            }}
          />
        )}
        {patientReportOpen && active && (
          <PatientReportDialog
            studyUid={active.study_uid}
            modality={active.modality}
            bodyPart={active.body_part}
            onClose={() => setPatientReportOpen(false)}
          />
        )}
        {smartReportOpen && active && (
          <SmartReportDialog
            studyUid={active.study_uid}
            modality={active.modality}
            bodyPart={active.body_part}
            findings=""
            symptoms={active.symptoms}
            clinicalHistory={active.clinical_history}
            age={active.age}
            sex={active.sex}
            onClose={() => setSmartReportOpen(false)}
          />
        )}
        {intakeOpen && active && (
          <PatientIntakeDialog
            studyUid={active.study_uid}
            modality={active.modality}
            bodyPart={active.body_part}
            age={active.age}
            sex={active.sex}
            symptoms={active.symptoms}
            clinicalHistory={active.clinical_history}
            findings=""
            onClose={() => setIntakeOpen(false)}
          />
        )}
        {triplanarOpen && active && (
          <TriplanarViewerModal
            studyUid={active.study_uid}
            totalSlices={totalSlices}
            onClose={() => setTriplanarOpen(false)}
          />
        )}

        {/* Center: DICOM viewer */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* PriorStudiesStrip deferred for pilot */}
          <div className="min-h-0 flex-1 bg-black">
            {active ? (
              <DicomViewer
                studyUid={active.study_uid}
                modality={active.modality}
                bodyPart={active.body_part}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-slate-500">
                <div className="max-w-md text-center">
                  <div className="mb-3 text-5xl">🩻</div>
                  <div className="mb-2 text-lg font-bold text-slate-200">
                    Your reading room is empty
                  </div>
                  <p className="mb-5 text-xs text-slate-500">
                    Add a case to start reading. Drop a DICOM file, or enter patient details
                    manually for demo. Cases live in{' '}
                    <code className="rounded bg-slate-900 px-1 text-slate-400">
                      services/mcp-bridge/data/studies
                    </code>
                    .
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="flex items-center gap-2 rounded bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add first case
                    </button>
                    <Link
                      href="/upload"
                      className="flex items-center gap-2 rounded border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      Batch upload
                    </Link>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2 text-left text-[10px] text-slate-500">
                    <div className="rounded border border-slate-800 p-2">
                      <div className="mb-1 font-bold text-slate-400">1 · Ingest</div>
                      DICOM in → study appears in worklist
                    </div>
                    <div className="rounded border border-slate-800 p-2">
                      <div className="mb-1 font-bold text-slate-400">2 · Read</div>
                      Cornerstone viewer + AI findings streamed
                    </div>
                    <div className="rounded border border-slate-800 p-2">
                      <div className="mb-1 font-bold text-slate-400">3 · Sign</div>
                      PDF + DICOM SR to referrer
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* CompareViewer deferred for pilot */}
          {/* Study meta strip */}
          {active && (
            <div className="border-t border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-300">{active.patient_name}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">{active.patient_id}</span>
                {active.age !== null && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">
                      {active.age}
                      {active.sex ? active.sex : ''}
                    </span>
                  </>
                )}
                <span className="text-slate-600">·</span>
                <span className="text-cyan-400">
                  {active.modality} · {active.body_part}
                </span>
                {active.description && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="truncate text-slate-400">{active.description}</span>
                  </>
                )}
              </div>
              {(active.symptoms || active.clinical_history) && (
                <div className="mt-1 flex flex-wrap items-start gap-3">
                  {active.symptoms && (
                    <span className="flex items-start gap-1">
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                        SYMPTOMS
                      </span>
                      <span className="text-slate-300">{active.symptoms}</span>
                    </span>
                  )}
                  {active.clinical_history && (
                    <span className="flex items-start gap-1">
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                        HX
                      </span>
                      <span className="text-slate-400">{active.clinical_history}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right: AI report — desktop w-96 / landscape w-80 / portrait drawer */}
        <section
          className={
            'z-40 flex flex-col border-l border-slate-800 transition-transform duration-200 ' +
            (isTabletPortrait
              ? 'absolute inset-y-0 right-0 w-[380px] max-w-[85vw] shadow-2xl ' +
                (reportOpen ? 'translate-x-0' : 'translate-x-full')
              : isTablet
                ? 'w-80'
                : 'w-96')
          }
        >
          {/* Close button on tablet portrait drawer */}
          {isTabletPortrait && (
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
              aria-label="Close report"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {active ? (
            <ReportComposer study={studyToMeta(active)} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Select a case
            </div>
          )}
        </section>
      </div>

      {/* Voice dictate + Voice commands deferred for pilot */}

      <RoomShortcuts
        onNextCase={nextCase}
        onPrevCase={prevCase}
        onToggleWorklist={() => setWorklistCollapsed((v) => !v)}
        onHelp={() => setHelpOpen(true)}
        onSign={() => {
          const btn = document.querySelector<HTMLButtonElement>('button[title*="Sign"]');
          btn?.click();
        }}
      />

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-cyan-500/40 bg-slate-900 px-4 py-2 text-sm text-cyan-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

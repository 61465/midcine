'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Sparkles, HelpCircle } from 'lucide-react';
import { WorklistRail } from './worklist-rail';
import { ReportComposer } from './report-composer';
import { SavingsCounter } from './savings-counter';
import { VoiceDictate } from './voice-dictate';
import { RoomShortcuts } from './room-shortcuts';
import { HelpOverlay } from './help-overlay';
import { TrialBanner } from '../auth/trial-banner';
import { DicomViewer } from '../dicom-viewer-loader';
import { fetchStudies, type Study } from '../../../lib/studies';
import type { StudyMetadata } from '../../../lib/mcp';

function studyToMeta(s: Study): StudyMetadata {
  return {
    study_uid: s.study_uid,
    modality: s.modality,
    body_part: s.body_part,
    patient_id: s.patient_id,
    patient_name: s.patient_name,
    clinical_context: s.description,
    hospital_id: s.hospital_id,
  };
}

export function ReadingRoom() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [worklistCollapsed, setWorklistCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void fetchStudies().then((all) => {
      setStudies(all);
      if (all.length > 0 && !activeUid) setActiveUid(all[0]!.study_uid);
    });
  }, []);

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
        <div className="flex items-center gap-3">
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
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-[10px] uppercase tracking-widest text-cyan-400">Reading Room</span>
        </div>
        <div className="flex items-center gap-2">
          <TrialBanner />
          <SavingsCounter compact />
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
        </div>
      </header>

      {/* Main 3-column workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Worklist */}
        <WorklistRail
          activeStudyUid={activeUid}
          onSelect={setActiveUid}
          collapsed={worklistCollapsed}
          onToggleCollapsed={() => setWorklistCollapsed((v) => !v)}
        />

        {/* Center: DICOM viewer */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 bg-black">
            {active ? (
              <DicomViewer />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-500">
                <div className="text-center">
                  <div className="mb-2 text-4xl">📥</div>
                  <div className="text-sm">No studies in worklist</div>
                  <div className="mt-1 text-[10px] text-slate-600">
                    Connect Orthanc or add JSON to data/studies
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Study meta strip */}
          {active && (
            <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-950 px-3 py-1.5 text-[10px]">
              <span className="font-bold text-slate-300">{active.patient_name}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">{active.patient_id}</span>
              <span className="text-slate-600">·</span>
              <span className="text-cyan-400">
                {active.modality} · {active.body_part}
              </span>
              <span className="text-slate-600">·</span>
              <span className="truncate text-slate-400">{active.description}</span>
            </div>
          )}
        </main>

        {/* Right: AI report */}
        <section className="flex w-96 flex-col border-l border-slate-800">
          {active ? (
            <ReportComposer study={studyToMeta(active)} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">
              Select a case
            </div>
          )}
        </section>
      </div>

      {/* Voice mic */}
      <VoiceDictate
        onText={(text) => {
          const el = document.activeElement as HTMLTextAreaElement | null;
          if (el && el.tagName === 'TEXTAREA') {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, start) + text + el.value.slice(end);
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }}
      />

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

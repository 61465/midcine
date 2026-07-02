'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Heart, Wind, Brain, Droplets, Users } from 'lucide-react';

// Heart
import { RHYTHMS, RHYTHM_LIST, type RhythmId } from './presets';
import { EcgWaveform } from './ecg-waveform';
import { HeartSvg } from './heart-svg';
// Lungs
import { LUNG_STATES, LUNG_STATE_LIST, type LungStateId } from './lungs/presets';
import { Spirometry } from './lungs/spirometry';
import { LungsSvg } from './lungs/lungs-svg';
// Brain
import { BRAIN_STATES, BRAIN_STATE_LIST, type BrainStateId } from './brain/presets';
import { EegWaveform } from './brain/eeg-waveform';
import { BrainSvg } from './brain/brain-svg';
// Kidney
import { KIDNEY_STATES, KIDNEY_STATE_LIST, type KidneyStateId } from './kidney/presets';
import { Filtration } from './kidney/filtration';
import { KidneySvg } from './kidney/kidney-svg';
// Shared
import { PathologyAtlas } from './pathology-atlas';

// 3D models — load client-only (WebGL)
const Heart3D = dynamic(() => import('./heart-3d').then((m) => m.Heart3D), { ssr: false });
const Lungs3D = dynamic(() => import('./lungs/lungs-3d').then((m) => m.Lungs3D), { ssr: false });
const Brain3D = dynamic(() => import('./brain/brain-3d').then((m) => m.Brain3D), { ssr: false });
const Kidney3D = dynamic(() => import('./kidney/kidney-3d').then((m) => m.Kidney3D), {
  ssr: false,
});

type OrganTab = 'heart' | 'lungs' | 'brain' | 'kidney' | 'atlas';

const TABS: { id: OrganTab; label: string; icon: typeof Heart; color: string }[] = [
  { id: 'heart', label: 'القلب', icon: Heart, color: 'text-rose-500' },
  { id: 'lungs', label: 'الرئتان', icon: Wind, color: 'text-sky-500' },
  { id: 'brain', label: 'الدماغ', icon: Brain, color: 'text-fuchsia-500' },
  { id: 'kidney', label: 'الكليتان', icon: Droplets, color: 'text-amber-500' },
  { id: 'atlas', label: 'أطلس أمراض', icon: Users, color: 'text-cyan-500' },
];

// -----------------------------------------------------------------------------
// Reusable UI bits

function StateChips<T extends { id: string; labelAr: string }>({
  items,
  active,
  onPick,
}: {
  items: T[];
  active: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it.id)}
          className={
            'rounded-full border px-3 py-1 text-xs transition ' +
            (it.id === active
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
          }
        >
          {it.labelAr}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-3">
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="ltr-only w-16 text-right font-mono text-sm font-semibold text-gray-800">
        {value} <span className="text-[10px] text-gray-500">{unit}</span>
      </span>
    </div>
  );
}

function StateNote({ tone, text }: { tone: 'ok' | 'warn' | 'critical'; text: string }) {
  const cls =
    tone === 'critical'
      ? 'bg-red-100 border-red-300 text-red-900'
      : tone === 'warn'
        ? 'bg-amber-100 border-amber-300 text-amber-900'
        : 'bg-emerald-100 border-emerald-300 text-emerald-900';
  return <div className={`rounded border px-3 py-1 text-xs ${cls}`}>{text}</div>;
}

function OrganDescription({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
      <span className="font-semibold text-gray-900">{label}:</span> {text}
    </div>
  );
}

function GridPanel({
  children,
  label,
  extra,
}: {
  children: React.ReactNode;
  label: string;
  extra?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-black">
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5 text-[10px] text-gray-400">
        <span>{label}</span>
        {extra && <span className="ltr-only">{extra}</span>}
      </div>
      <div className="h-[calc(100%-30px)]">{children}</div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-organ labs

function HeartLab() {
  const [rhythmId, setRhythmId] = useState<RhythmId>('normal');
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const rhythm = RHYTHMS[rhythmId];
  const bpm = bpmOverride ?? rhythm.bpm;

  const note = useMemo(() => {
    if (rhythm.id === 'stemi')
      return { tone: 'critical' as const, text: 'طوارئ — PCI خلال ٩٠ دقيقة' };
    if (rhythm.id === 'afib')
      return { tone: 'warn' as const, text: 'خطر جلطة — قيّم CHA₂DS₂-VASc' };
    if (bpm < 50) return { tone: 'warn' as const, text: 'بطء نبض — تقييم الأعراض' };
    if (bpm > 120) return { tone: 'warn' as const, text: 'تسرّع نبض — قيّم السبب' };
    return { tone: 'ok' as const, text: 'ضمن المعدل الطبيعي' };
  }, [rhythm, bpm]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <StateChips
          items={RHYTHM_LIST}
          active={rhythmId}
          onPick={(id) => {
            setRhythmId(id as RhythmId);
            setBpmOverride(null);
          }}
        />
        <Slider label="BPM" value={bpm} min={30} max={180} unit="ن/د" onChange={setBpmOverride} />
        <StateNote {...note} />
      </div>
      <OrganDescription label={rhythm.labelAr} text={rhythm.descriptionAr} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[420px]">
          <GridPanel label="❤️ 3D Heart" extra="click + drag">
            <Heart3D rhythm={rhythm} bpm={bpm} />
          </GridPanel>
        </div>
        <div className="h-[420px]">
          <GridPanel label="ECG · Lead II" extra={`${bpm} bpm`}>
            <EcgWaveform rhythm={rhythm} bpm={bpm} />
          </GridPanel>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-1">
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
            🎨 SVG cross-section
          </div>
          <div className="h-[calc(100%-30px)]">
            <HeartSvg rhythm={rhythm} bpm={bpm} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LungsLab() {
  const [stateId, setStateId] = useState<LungStateId>('normal');
  const [rrOverride, setRrOverride] = useState<number | null>(null);
  const st = LUNG_STATES[stateId];
  const rr = rrOverride ?? st.rr;

  const note = useMemo(() => {
    if (stateId === 'pe') return { tone: 'critical' as const, text: 'طوارئ — CTA رئوي فوري' };
    if (stateId === 'pneumonia') return { tone: 'warn' as const, text: 'CXR + مضاد حيوي' };
    if (stateId === 'copd')
      return { tone: 'warn' as const, text: 'نوبة حادة؟ ابدأ bronchodilator' };
    if (rr > 24 || rr < 10) return { tone: 'warn' as const, text: 'معدل تنفّس غير طبيعي' };
    return { tone: 'ok' as const, text: 'تنفّس ضمن الطبيعي' };
  }, [stateId, rr]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <StateChips
          items={LUNG_STATE_LIST}
          active={stateId}
          onPick={(id) => {
            setStateId(id as LungStateId);
            setRrOverride(null);
          }}
        />
        <Slider label="RR" value={rr} min={6} max={40} unit="ن/د" onChange={setRrOverride} />
        <StateNote {...note} />
      </div>
      <OrganDescription label={st.labelAr} text={st.descriptionAr} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[420px]">
          <GridPanel label="🫁 3D Lungs" extra="click + drag">
            <Lungs3D state={st} rr={rr} />
          </GridPanel>
        </div>
        <div className="h-[420px]">
          <GridPanel label="Spirometry" extra={`${rr} rpm`}>
            <Spirometry state={st} rr={rr} />
          </GridPanel>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-1">
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
            🎨 SVG cross-section
          </div>
          <div className="h-[calc(100%-30px)]">
            <LungsSvg state={st} rr={rr} />
          </div>
        </div>
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200">
          <BioDigitalEmbed compact />
        </div>
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200">
          <VtkPlaceholder />
        </div>
      </div>
    </div>
  );
}

function BrainLab() {
  const [stateId, setStateId] = useState<BrainStateId>('normal');
  const st = BRAIN_STATES[stateId];

  const note = useMemo(() => {
    if (stateId === 'seizure') return { tone: 'critical' as const, text: 'طوارئ — benzodiazepine' };
    if (stateId === 'stroke_l' || stateId === 'stroke_r')
      return { tone: 'critical' as const, text: 'زمن حرج — CT + tPA حتى ٤.٥ ساعة' };
    if (stateId === 'coma')
      return { tone: 'critical' as const, text: 'قيّم GCS + استبعد hypoglycemia' };
    return { tone: 'ok' as const, text: 'نشاط طبيعي' };
  }, [stateId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <StateChips
          items={BRAIN_STATE_LIST}
          active={stateId}
          onPick={(id) => setStateId(id as BrainStateId)}
        />
        <div className="ltr-only text-xs text-gray-500">{st.dominantFreq} Hz dominant</div>
        <div className="flex-1" />
        <StateNote {...note} />
      </div>
      <OrganDescription label={st.labelAr} text={st.descriptionAr} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[420px]">
          <GridPanel label="🧠 3D Brain" extra="click + drag">
            <Brain3D state={st} />
          </GridPanel>
        </div>
        <div className="h-[420px]">
          <GridPanel label="EEG · 4-channel" extra={`${st.dominantFreq} Hz`}>
            <EegWaveform state={st} />
          </GridPanel>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-1">
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
            🎨 SVG top view
          </div>
          <div className="h-[calc(100%-30px)]">
            <BrainSvg state={st} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KidneyLab() {
  const [stateId, setStateId] = useState<KidneyStateId>('normal');
  const st = KIDNEY_STATES[stateId];

  const note = useMemo(() => {
    if (stateId === 'aki')
      return { tone: 'critical' as const, text: 'إصابة حادة — حدد السبب فوراً' };
    if (stateId === 'ckd5')
      return { tone: 'critical' as const, text: 'مرحلة نهائية — تنسيق غسيل/زراعة' };
    if (stateId === 'ckd3')
      return { tone: 'warn' as const, text: 'راجع الأدوية + متابعة nephrology' };
    if (stateId === 'stones') return { tone: 'warn' as const, text: 'CT KUB — قيّم الحجم' };
    return { tone: 'ok' as const, text: 'وظيفة كلوية طبيعية' };
  }, [stateId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <StateChips
          items={KIDNEY_STATE_LIST}
          active={stateId}
          onPick={(id) => setStateId(id as KidneyStateId)}
        />
        <div className="ltr-only text-xs text-gray-500">eGFR {st.gfr}</div>
        <div className="flex-1" />
        <StateNote {...note} />
      </div>
      <OrganDescription label={st.labelAr} text={st.descriptionAr} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[420px]">
          <GridPanel label="🥬 3D Kidneys" extra="click + drag">
            <Kidney3D state={st} />
          </GridPanel>
        </div>
        <div className="h-[420px]">
          <GridPanel label="Filtration Dashboard" extra={`GFR ${st.gfr}`}>
            <Filtration state={st} />
          </GridPanel>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-1">
        <div className="h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] text-gray-500">
            🎨 SVG anatomy
          </div>
          <div className="h-[calc(100%-30px)]">
            <KidneySvg state={st} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AtlasLab() {
  return (
    <div className="h-[calc(100vh-180px)]">
      <PathologyAtlas />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Top-level

export function AnatomyLab() {
  const [tab, setTab] = useState<OrganTab>('heart');

  return (
    <div className="flex h-full flex-col">
      {/* Organ tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-white px-3 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ' +
                (active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100')
              }
            >
              <Icon className={`h-4 w-4 ${active ? 'text-white' : t.color}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === 'heart' && <HeartLab />}
        {tab === 'lungs' && <LungsLab />}
        {tab === 'brain' && <BrainLab />}
        {tab === 'kidney' && <KidneyLab />}
        {tab === 'atlas' && <AtlasLab />}
      </div>
    </div>
  );
}

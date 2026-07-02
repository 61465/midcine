'use client';

import type { ReactElement } from 'react';
import { Heart, Wind, Brain, Droplets } from 'lucide-react';
import { HeartSvg } from './heart-svg';
import { LungsSvg } from './lungs/lungs-svg';
import { BrainSvg } from './brain/brain-svg';
import { KidneySvg } from './kidney/kidney-svg';
import { RHYTHMS, type RhythmId } from './presets';
import { LUNG_STATES, type LungStateId } from './lungs/presets';
import { BRAIN_STATES, type BrainStateId } from './brain/presets';
import { KIDNEY_STATES, type KidneyStateId } from './kidney/presets';

// Shared registry — lets any component (EnsemblePanel, PathologyAtlas, ReportEditor)
// look up the visual + metadata for a pathology condition by (organ, id).

export type OrganKey = 'heart' | 'lungs' | 'brain' | 'kidney';
export type Severity = 'normal' | 'moderate' | 'severe' | 'emergency';

export interface AtlasCondition {
  organ: OrganKey;
  id: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  severity: Severity;
  render: () => ReactElement;
  radiopaediaUrl?: string;
}

export const ORGAN_META: Record<OrganKey, { icon: typeof Heart; labelAr: string; color: string }> =
  {
    heart: { icon: Heart, labelAr: 'قلب', color: 'text-rose-500' },
    lungs: { icon: Wind, labelAr: 'رئتين', color: 'text-sky-500' },
    brain: { icon: Brain, labelAr: 'دماغ', color: 'text-fuchsia-500' },
    kidney: { icon: Droplets, labelAr: 'كليتين', color: 'text-amber-500' },
  };

export const SEVERITY_STYLES: Record<
  Severity,
  { bg: string; ring: string; badge: string; label: string }
> = {
  normal: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200 hover:ring-emerald-400',
    badge: 'bg-emerald-100 text-emerald-800',
    label: 'طبيعي',
  },
  moderate: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-200 hover:ring-amber-400',
    badge: 'bg-amber-100 text-amber-800',
    label: 'متوسط',
  },
  severe: {
    bg: 'bg-orange-50',
    ring: 'ring-orange-200 hover:ring-orange-400',
    badge: 'bg-orange-100 text-orange-800',
    label: 'شديد',
  },
  emergency: {
    bg: 'bg-red-50',
    ring: 'ring-red-200 hover:ring-red-400',
    badge: 'bg-red-100 text-red-800 font-bold animate-pulse',
    label: 'طوارئ',
  },
};

function radiopaediaLink(labelEn: string): string {
  return `https://radiopaedia.org/search?q=${encodeURIComponent(labelEn)}`;
}

// Build the full registry once at module load.
const REGISTRY: Record<OrganKey, Record<string, AtlasCondition>> = {
  heart: {},
  lungs: {},
  brain: {},
  kidney: {},
};

// Heart
for (const [id, r] of Object.entries(RHYTHMS)) {
  const sev: Severity =
    r.id === 'stemi'
      ? 'emergency'
      : r.id === 'afib'
        ? 'severe'
        : r.id === 'normal'
          ? 'normal'
          : 'moderate';
  REGISTRY.heart[id] = {
    organ: 'heart',
    id,
    labelAr: r.labelAr,
    labelEn: r.labelEn,
    descriptionAr: r.descriptionAr,
    severity: sev,
    render: () => <HeartSvg rhythm={r} bpm={r.bpm} />,
    radiopaediaUrl: r.id !== 'normal' ? radiopaediaLink(r.labelEn) : undefined,
  };
}

// Lungs
for (const [id, s] of Object.entries(LUNG_STATES)) {
  const sev: Severity =
    s.id === 'pe'
      ? 'emergency'
      : s.id === 'pneumonia' || s.id === 'copd'
        ? 'severe'
        : s.id === 'normal'
          ? 'normal'
          : 'moderate';
  REGISTRY.lungs[id] = {
    organ: 'lungs',
    id,
    labelAr: s.labelAr,
    labelEn: s.labelEn,
    descriptionAr: s.descriptionAr,
    severity: sev,
    render: () => <LungsSvg state={s} rr={s.rr} />,
    radiopaediaUrl: s.id !== 'normal' ? radiopaediaLink(s.labelEn) : undefined,
  };
}

// Brain
for (const [id, s] of Object.entries(BRAIN_STATES)) {
  const sev: Severity =
    s.id === 'seizure' || s.id === 'stroke_l' || s.id === 'stroke_r' || s.id === 'coma'
      ? 'emergency'
      : 'normal';
  REGISTRY.brain[id] = {
    organ: 'brain',
    id,
    labelAr: s.labelAr,
    labelEn: s.labelEn,
    descriptionAr: s.descriptionAr,
    severity: sev,
    render: () => <BrainSvg state={s} />,
    radiopaediaUrl: s.id !== 'normal' ? radiopaediaLink(s.labelEn) : undefined,
  };
}

// Kidney
for (const [id, s] of Object.entries(KIDNEY_STATES)) {
  const sev: Severity =
    s.id === 'ckd5' || s.id === 'aki'
      ? 'emergency'
      : s.id === 'ckd3'
        ? 'severe'
        : s.id === 'normal'
          ? 'normal'
          : 'moderate';
  REGISTRY.kidney[id] = {
    organ: 'kidney',
    id,
    labelAr: s.labelAr,
    labelEn: s.labelEn,
    descriptionAr: s.descriptionAr,
    severity: sev,
    render: () => <KidneySvg state={s} />,
    radiopaediaUrl: s.id !== 'normal' ? radiopaediaLink(s.labelEn) : undefined,
  };
}

export function getCondition(organ: OrganKey, id: string): AtlasCondition | null {
  return REGISTRY[organ]?.[id] ?? null;
}

export function allConditions(): AtlasCondition[] {
  return Object.values(REGISTRY).flatMap((m) => Object.values(m));
}

export function conditionsByOrgan(organ: OrganKey): AtlasCondition[] {
  return Object.values(REGISTRY[organ]);
}

// Reference lookup used by other components
export const HEART_IDS = Object.keys(RHYTHMS) as RhythmId[];
export const LUNG_IDS = Object.keys(LUNG_STATES) as LungStateId[];
export const BRAIN_IDS = Object.keys(BRAIN_STATES) as BrainStateId[];
export const KIDNEY_IDS = Object.keys(KIDNEY_STATES) as KidneyStateId[];

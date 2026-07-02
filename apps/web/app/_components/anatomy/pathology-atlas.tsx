'use client';

import { useState, useMemo, type ReactElement } from 'react';
import { Heart, Wind, Brain, Droplets, ExternalLink, Info, X, BookOpen } from 'lucide-react';

// midcine's own pathology-state SVGs — react to disease params and render the
// visual state (STEMI dimmed anterior wall, unilateral stroke, right-side
// pneumonia consolidation, CKD5 bilateral shrinking, etc.)
import { HeartSvg } from './heart-svg';
import { LungsSvg } from './lungs/lungs-svg';
import { BrainSvg } from './brain/brain-svg';
import { KidneySvg } from './kidney/kidney-svg';
import { RHYTHM_LIST, type Rhythm } from './presets';
import { LUNG_STATE_LIST, type LungState } from './lungs/presets';
import { BRAIN_STATE_LIST, type BrainState } from './brain/presets';
import { KIDNEY_STATE_LIST, type KidneyState } from './kidney/presets';

// ─────────────────────────────────────────────────────────────────────────────
// Pathology Atlas — 21 disease states across 4 organs, each with visual SVG.
//
// This replaces the old "BioDigital Atlas" tab. Rather than depend on paid
// external services, we surface midcine's own state-driven SVG library, which
// visualizes disease presentation (dimmed infarct zones, unilateral stroke
// hemispheres, side-asymmetric pneumonia, bilateral kidney shrinking).
//
// External medical illustration libraries (free, CC-licensed) are linked at
// the bottom as supplementary references, not as replacements.
// ─────────────────────────────────────────────────────────────────────────────

type OrganKey = 'heart' | 'lungs' | 'brain' | 'kidney';

interface Card {
  organ: OrganKey;
  id: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  severity: 'normal' | 'moderate' | 'severe' | 'emergency';
  render: (size: 'small' | 'large') => ReactElement;
  external?: string; // Radiopaedia / StatPearls / Wikipedia case link
}

function severityFor(rhythm: Rhythm): Card['severity'] {
  if (rhythm.id === 'stemi') return 'emergency';
  if (rhythm.id === 'afib') return 'severe';
  if (rhythm.id === 'normal') return 'normal';
  return 'moderate';
}

function severityForLung(s: LungState): Card['severity'] {
  if (s.id === 'pe') return 'emergency';
  if (s.id === 'pneumonia' || s.id === 'copd') return 'severe';
  if (s.id === 'normal') return 'normal';
  return 'moderate';
}

function severityForBrain(s: BrainState): Card['severity'] {
  if (s.id === 'seizure' || s.id === 'stroke_l' || s.id === 'stroke_r' || s.id === 'coma')
    return 'emergency';
  return 'normal';
}

function severityForKidney(s: KidneyState): Card['severity'] {
  if (s.id === 'ckd5' || s.id === 'aki') return 'emergency';
  if (s.id === 'ckd3') return 'severe';
  if (s.id === 'normal') return 'normal';
  return 'moderate';
}

// Free medical illustration libraries. All CC-licensed, no auth, no key.
const ILLUSTRATION_LIBRARIES = [
  {
    name: 'Servier Medical Art',
    url: 'https://smart.servier.com/',
    desc: '3000+ SVG طبي مجاني (CC-BY 3.0)',
    tag: 'CC-BY',
    tagColor: 'emerald',
  },
  {
    name: 'Radiopaedia',
    url: 'https://radiopaedia.org/cases',
    desc: 'حالات إشعاعية حقيقية مع صور فعلية',
    tag: 'مجاني',
    tagColor: 'cyan',
  },
  {
    name: 'NIH BioArt',
    url: 'https://bioart.niaid.nih.gov/',
    desc: 'رسومات طبية من المعاهد الوطنية للصحة',
    tag: 'CC0',
    tagColor: 'emerald',
  },
  {
    name: 'Wikimedia Medical',
    url: 'https://commons.wikimedia.org/wiki/Category:Medical_illustrations',
    desc: 'آلاف الرسوم الطبية بترخيص مفتوح',
    tag: 'CC',
    tagColor: 'emerald',
  },
  {
    name: 'Sketchfab Anatomy',
    url: 'https://sketchfab.com/search?type=models&features=downloadable&q=anatomy',
    desc: 'نماذج 3D قابلة للتنزيل',
    tag: 'مختلط',
    tagColor: 'amber',
  },
  {
    name: 'Z-Anatomy',
    url: 'https://www.z-anatomy.com/',
    desc: 'أطلس مفتوح المصدر كامل الجسم',
    tag: 'مفتوح',
    tagColor: 'emerald',
  },
];

const SEVERITY_STYLES: Record<
  Card['severity'],
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

const ORGAN_META: Record<OrganKey, { icon: typeof Heart; label: string; color: string }> = {
  heart: { icon: Heart, label: 'قلب', color: 'text-rose-500' },
  lungs: { icon: Wind, label: 'رئتين', color: 'text-sky-500' },
  brain: { icon: Brain, label: 'دماغ', color: 'text-fuchsia-500' },
  kidney: { icon: Droplets, label: 'كليتين', color: 'text-amber-500' },
};

export function PathologyAtlas() {
  const [filter, setFilter] = useState<OrganKey | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<Card['severity'] | 'all'>('all');
  const [expanded, setExpanded] = useState<Card | null>(null);

  const cards = useMemo<Card[]>(() => {
    const list: Card[] = [];

    // Heart — 5 rhythms
    for (const r of RHYTHM_LIST) {
      list.push({
        organ: 'heart',
        id: `heart-${r.id}`,
        labelAr: r.labelAr,
        labelEn: r.labelEn,
        descriptionAr: r.descriptionAr,
        severity: severityFor(r),
        render: (size) => (
          <div className={size === 'small' ? 'h-full w-full' : 'h-full w-full'}>
            <HeartSvg rhythm={r} bpm={r.bpm} />
          </div>
        ),
        external:
          r.id !== 'normal'
            ? `https://radiopaedia.org/search?q=${encodeURIComponent(r.labelEn)}`
            : undefined,
      });
    }
    // Lungs — 6 states
    for (const s of LUNG_STATE_LIST) {
      list.push({
        organ: 'lungs',
        id: `lungs-${s.id}`,
        labelAr: s.labelAr,
        labelEn: s.labelEn,
        descriptionAr: s.descriptionAr,
        severity: severityForLung(s),
        render: () => (
          <div className="h-full w-full">
            <LungsSvg state={s} rr={s.rr} />
          </div>
        ),
        external:
          s.id !== 'normal'
            ? `https://radiopaedia.org/search?q=${encodeURIComponent(s.labelEn)}`
            : undefined,
      });
    }
    // Brain — 5 states
    for (const s of BRAIN_STATE_LIST) {
      list.push({
        organ: 'brain',
        id: `brain-${s.id}`,
        labelAr: s.labelAr,
        labelEn: s.labelEn,
        descriptionAr: s.descriptionAr,
        severity: severityForBrain(s),
        render: () => (
          <div className="h-full w-full">
            <BrainSvg state={s} />
          </div>
        ),
        external:
          s.id !== 'normal'
            ? `https://radiopaedia.org/search?q=${encodeURIComponent(s.labelEn)}`
            : undefined,
      });
    }
    // Kidney — 5 states
    for (const s of KIDNEY_STATE_LIST) {
      list.push({
        organ: 'kidney',
        id: `kidney-${s.id}`,
        labelAr: s.labelAr,
        labelEn: s.labelEn,
        descriptionAr: s.descriptionAr,
        severity: severityForKidney(s),
        render: () => (
          <div className="h-full w-full">
            <KidneySvg state={s} />
          </div>
        ),
        external:
          s.id !== 'normal'
            ? `https://radiopaedia.org/search?q=${encodeURIComponent(s.labelEn)}`
            : undefined,
      });
    }

    return list;
  }, []);

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (filter === 'all' || c.organ === filter) &&
          (severityFilter === 'all' || c.severity === severityFilter),
      ),
    [cards, filter, severityFilter],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {/* Header banner */}
      <div className="flex items-start gap-3 rounded-lg border border-cyan-200 bg-gradient-to-l from-cyan-50 to-sky-50 p-3">
        <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-600" />
        <div className="flex-1 text-sm text-cyan-900">
          <div className="font-bold">أطلس أمراض midcine</div>
          <div className="mt-0.5 text-xs text-cyan-800">
            {cards.length} حالة مرضية مرسومة بصرياً — SVG تتفاعل مع حالة المرض (منطقة الاحتشاء
            مظلَّمة، نصف كروي متأثر، ارتشاح جانبي، تقلّص كلوي ثنائي).
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={
              'rounded-full px-3 py-1 text-xs font-medium transition ' +
              (filter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }
          >
            كل الأعضاء ({cards.length})
          </button>
          {(Object.keys(ORGAN_META) as OrganKey[]).map((k) => {
            const meta = ORGAN_META[k];
            const Icon = meta.icon;
            const count = cards.filter((c) => c.organ === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={
                  'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ' +
                  (filter === k
                    ? 'bg-slate-800 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                }
              >
                <Icon className={'h-3 w-3 ' + (filter === k ? 'text-white' : meta.color)} />
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="ms-auto flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSeverityFilter('all')}
            className={
              'rounded-full px-3 py-1 text-[10px] font-medium transition ' +
              (severityFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
            }
          >
            كل الحدّة
          </button>
          {(['emergency', 'severe', 'moderate', 'normal'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={
                'rounded-full px-3 py-1 text-[10px] font-medium transition ' +
                (severityFilter === s
                  ? SEVERITY_STYLES[s].badge
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
              }
            >
              {SEVERITY_STYLES[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => {
            const st = SEVERITY_STYLES[c.severity];
            const meta = ORGAN_META[c.organ];
            const Icon = meta.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setExpanded(c)}
                className={`group flex flex-col overflow-hidden rounded-xl ring-1 ring-inset transition ${st.bg} ${st.ring} text-right`}
              >
                <div className="flex items-center gap-1.5 border-b border-black/5 px-3 py-2">
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                  <span className="text-[11px] font-bold text-slate-700">{meta.label}</span>
                  <div className="flex-1" />
                  <span className={`rounded-full px-2 py-0.5 text-[9px] ${st.badge}`}>
                    {st.label}
                  </span>
                </div>
                <div className="h-32 overflow-hidden bg-white">{c.render('small')}</div>
                <div className="border-t border-black/5 px-3 py-2">
                  <div className="text-xs font-bold text-slate-800">{c.labelAr}</div>
                  <div className="ltr-only text-[9px] text-slate-500">{c.labelEn}</div>
                </div>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">
            لا حالات تطابق الفلتر
          </div>
        )}

        {/* External libraries */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
            مكتبات رسم طبي إضافية (مجانية)
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ILLUSTRATION_LIBRARIES.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 rounded border border-slate-200 bg-white p-2 transition hover:border-cyan-400 hover:bg-cyan-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="ltr-only text-xs font-bold text-slate-800 group-hover:text-cyan-700">
                      {a.name}
                    </span>
                    <span
                      className={
                        'rounded-full px-1.5 py-0.5 text-[8px] font-bold ' +
                        (a.tagColor === 'emerald'
                          ? 'bg-emerald-100 text-emerald-700'
                          : a.tagColor === 'amber'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-cyan-100 text-cyan-700')
                      }
                    >
                      {a.tag}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{a.desc}</div>
                </div>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-400 group-hover:text-cyan-500" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur"
          onClick={() => setExpanded(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-gray-200 bg-slate-50 px-4 py-3">
              {(() => {
                const Icon = ORGAN_META[expanded.organ].icon;
                return <Icon className={`h-5 w-5 ${ORGAN_META[expanded.organ].color}`} />;
              })()}
              <div>
                <div className="text-lg font-bold text-slate-800">{expanded.labelAr}</div>
                <div className="ltr-only text-xs text-slate-500">{expanded.labelEn}</div>
              </div>
              <div className="flex-1" />
              <span
                className={`rounded-full px-3 py-1 text-[11px] ${
                  SEVERITY_STYLES[expanded.severity].badge
                }`}
              >
                {SEVERITY_STYLES[expanded.severity].label}
              </span>
              <button
                type="button"
                onClick={() => setExpanded(null)}
                className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="aspect-square overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {expanded.render('large')}
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      الوصف الإكلينيكي
                    </div>
                    <p className="leading-relaxed text-slate-700">{expanded.descriptionAr}</p>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
                    <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <div>
                      الرسم أعلاه يستجيب لبارامترات المرض ديناميكياً: طول موجات ECG، نسبة I:E، تباطؤ
                      EEG، GFR، جانب التأثّر. غير محاكاة عامة — بصمة بصرية لهذه الحالة تحديداً.
                    </div>
                  </div>

                  {expanded.external && (
                    <a
                      href={expanded.external}
                      target="_blank"
                      rel="noopener"
                      className="ltr-only inline-flex items-center gap-1.5 rounded-full bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
                    >
                      حالات مماثلة على Radiopaedia <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

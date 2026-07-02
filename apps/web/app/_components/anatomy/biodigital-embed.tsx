'use client';

import { useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';

// BioDigital Human — public demo scene with UI enabled so it acts as a
// full anatomy atlas. User can rotate, dissect, search organs, toggle layers.
// TODO: register midcine as BioDigital developer to unlock:
//   - private scenes with disease overlays (STEMI, COPD, stones)
//   - Arabic labels
//   - annotation authoring
//   - patient-specific integrations via HumanAPI

const SCENES = [
  { id: 'production/maleAdult/heart_module', label: 'قلب' },
  { id: 'production/maleAdult/respiratory_module', label: 'جهاز تنفسي' },
  { id: 'production/maleAdult/nervous_module', label: 'جهاز عصبي' },
  { id: 'production/maleAdult/urinary_module', label: 'جهاز بولي' },
  { id: 'production/maleAdult/full_body', label: 'جسم كامل' },
];

export function BioDigitalEmbed({ compact = false }: { compact?: boolean }) {
  const [scene, setScene] = useState(SCENES[0].id);
  // The public embed URL — full UI enabled for atlas-style interaction
  const url =
    `https://human.biodigital.com/viewer/?id=${encodeURIComponent(scene)}` +
    `&ui-anatomy-descriptions=true` +
    `&ui-anatomy-labels=true` +
    `&ui-anatomy-tap=true` +
    `&ui-audio=false` +
    `&ui-chapter-list=false` +
    `&ui-fullscreen=true` +
    `&ui-help=true` +
    `&ui-info=true` +
    `&ui-label-list=true` +
    `&ui-layers=true` +
    `&ui-loader=circle` +
    `&ui-media-controls=full` +
    `&ui-menu=true` +
    `&ui-nav=true` +
    `&ui-search=true` +
    `&ui-tools=true` +
    `&ui-tutorial=false` +
    `&ui-undo=true` +
    `&initial.none=false` +
    `&paid=o&uaid=OpAP`;

  return (
    <div className="flex h-full w-full flex-col bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5">
        <span className="text-xs font-semibold text-slate-200">🧠 BioDigital Human</span>
        {!compact && (
          <div className="flex flex-wrap gap-1">
            {SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScene(s.id)}
                className={
                  'rounded px-2 py-0.5 text-[10px] transition ' +
                  (s.id === scene
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        <a
          href="https://developer.biodigital.com/"
          target="_blank"
          rel="noopener"
          className="ltr-only flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
        >
          API key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe
        src={url}
        className="min-h-0 flex-1 border-0 bg-slate-950"
        title="BioDigital Human Atlas"
        allow="fullscreen; autoplay; xr-spatial-tracking"
      />
      {!compact && (
        <div className="flex items-start gap-2 border-t border-slate-700 bg-slate-800 px-3 py-2 text-[10px] text-slate-400">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            atlas تفاعلي كامل — دوران، تقشير طبقات، بحث عن أي بنية، شرح صوتي. لدمج overlays مرضية
            عربية (STEMI/COPD/AKI) داخل نفس المشهد، يلزم API key.
          </span>
        </div>
      )}
    </div>
  );
}

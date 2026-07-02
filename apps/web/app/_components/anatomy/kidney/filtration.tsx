'use client';

import type { KidneyState } from './presets';

// Static bar chart-ish visualization of GFR with CKD-stage reference lines.
// Also shows a small nephron cross-section with animated filtration.
const STAGES = [
  { min: 90, max: 130, label: 'طبيعي', color: '#22c55e' },
  { min: 60, max: 89, label: 'خفيف (١-٢)', color: '#84cc16' },
  { min: 45, max: 59, label: '٣أ', color: '#eab308' },
  { min: 30, max: 44, label: '٣ب', color: '#f59e0b' },
  { min: 15, max: 29, label: '٤', color: '#ea580c' },
  { min: 0, max: 14, label: '٥ (نهائي)', color: '#b91c1c' },
];

export function Filtration({ state }: { state: KidneyState }) {
  const stage =
    STAGES.find((s) => state.gfr >= s.min && state.gfr <= s.max) ?? STAGES[STAGES.length - 1];
  const pctFromMax = Math.min(100, (state.gfr / 130) * 100);

  return (
    <div className="flex h-full w-full flex-col bg-black text-amber-200">
      <div className="flex items-center justify-between border-b border-amber-900 px-3 py-1.5 text-[10px] uppercase">
        <span>eGFR · ml/min/1.73m²</span>
        <span className="ltr-only" style={{ color: stage.color }}>
          {state.gfr} · Stage {stage.label}
        </span>
      </div>

      <div className="flex-1 space-y-3 p-4">
        {/* GFR gauge */}
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span>eGFR الحالي</span>
            <span className="ltr-only font-mono text-2xl font-bold" style={{ color: stage.color }}>
              {state.gfr}
            </span>
          </div>
          <div className="relative h-6 overflow-hidden rounded bg-slate-800">
            <div
              className="absolute inset-y-0 right-0 transition-all"
              style={{
                width: `${pctFromMax}%`,
                background: `linear-gradient(90deg, ${stage.color}88, ${stage.color})`,
              }}
            />
            {/* Stage boundary markers */}
            {[15, 30, 45, 60, 90].map((v) => (
              <div
                key={v}
                className="absolute inset-y-0 w-px bg-slate-500"
                style={{ right: `${(v / 130) * 100}%` }}
                title={`${v}`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-500">
            <span>130</span>
            <span>90</span>
            <span>60</span>
            <span>45</span>
            <span>30</span>
            <span>15</span>
            <span>0</span>
          </div>
        </div>

        {/* Stage legend */}
        <div className="grid grid-cols-6 gap-1">
          {STAGES.map((s) => (
            <div
              key={s.label}
              className={
                'rounded px-1 py-1 text-center text-[9px] ' +
                (s.label === stage.label ? 'ring-2 ring-amber-300' : 'opacity-60')
              }
              style={{ background: `${s.color}30`, color: s.color }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Nephron sketch */}
        <div className="mt-2 border-t border-slate-800 pt-2">
          <div className="mb-1 text-[10px] text-slate-400">مقطع نيفرون (فلترة)</div>
          <svg viewBox="0 0 300 90" className="w-full">
            {/* Afferent arteriole */}
            <path d="M 10 45 L 60 45" stroke="#ef4444" strokeWidth="3" />
            {/* Glomerulus */}
            <circle cx="80" cy="45" r="18" fill="none" stroke="#f59e0b" strokeWidth="2" />
            <path d="M 65 45 Q 80 30 95 45 Q 80 60 65 45" fill="#f59e0b" opacity="0.6" />
            {/* Efferent */}
            <path d="M 100 45 L 130 45" stroke="#ef4444" strokeWidth="2.5" />
            {/* Bowman capsule leading to tubule */}
            <path
              d="M 100 45 L 140 45 C 160 45, 160 65, 180 65 C 200 65, 200 25, 220 25 C 240 25, 240 65, 260 65 L 290 65"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
            />
            {/* Filtrate droplets — animate opacity based on GFR */}
            {[...Array(6)].map((_, i) => (
              <circle
                key={i}
                cx={95 + i * 30}
                cy={65}
                r="1.6"
                fill="#67e8f9"
                opacity={state.gfr / 130}
              >
                <animate
                  attributeName="cx"
                  from={95 + i * 30}
                  to={125 + i * 30}
                  dur={`${1.5 + (105 - state.gfr) / 60}s`}
                  repeatCount="indefinite"
                />
              </circle>
            ))}
            {/* Labels */}
            <text x="80" y="80" textAnchor="middle" fontSize="7" fill="#94a3b8">
              كبيبة
            </text>
            <text x="220" y="85" textAnchor="middle" fontSize="7" fill="#94a3b8">
              أنبوب
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

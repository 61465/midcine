'use client';

import type { KidneyState } from './presets';

export function KidneySvg({ state }: { state: KidneyState }) {
  const leftAffected = state.affected === 'left' || state.affected === 'bilateral';
  const rightAffected = state.affected === 'right' || state.affected === 'bilateral';
  const gfrColor = state.gfr >= 60 ? '#dc2626' : state.gfr >= 30 ? '#c2410c' : '#7f1d1d';

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-amber-50 to-white p-4">
      <svg viewBox="0 0 200 220" className="h-full max-h-[420px] w-auto">
        {/* Left kidney (bean) */}
        <path
          d="M 55 40 Q 25 55, 30 100 Q 35 145, 60 155 Q 85 145, 80 100 Q 82 60, 65 45 L 60 60 Q 55 65, 60 75 Q 65 90, 60 100 Q 58 110, 65 120 Z"
          fill={leftAffected ? '#8b5a4a' : gfrColor}
          stroke="#7f1d1d"
          strokeWidth="1.5"
          opacity={leftAffected ? 0.6 : 1}
        />
        {/* Right kidney */}
        <path
          d="M 135 40 Q 165 55, 160 100 Q 155 145, 130 155 Q 105 145, 110 100 Q 108 60, 125 45 L 130 60 Q 135 65, 130 75 Q 125 90, 130 100 Q 132 110, 125 120 Z"
          fill={rightAffected ? '#8b5a4a' : gfrColor}
          stroke="#7f1d1d"
          strokeWidth="1.5"
          opacity={rightAffected ? 0.6 : 1}
        />
        {/* Renal pelvis (hilum) hint */}
        <ellipse cx="60" cy="100" rx="8" ry="12" fill="#fde68a" opacity="0.4" />
        <ellipse cx="130" cy="100" rx="8" ry="12" fill="#fde68a" opacity="0.4" />

        {/* Ureters */}
        <path d="M 60 155 Q 70 175, 90 200" stroke="#d4a898" strokeWidth="3" fill="none" />
        <path d="M 130 155 Q 120 175, 100 200" stroke="#d4a898" strokeWidth="3" fill="none" />

        {/* Bladder */}
        <ellipse
          cx="95"
          cy="205"
          rx="20"
          ry="10"
          fill="#fef3c7"
          stroke="#b45309"
          strokeWidth="1.5"
        />

        {/* Stone */}
        {state.stones && (
          <g>
            <polygon
              points={
                state.affected === 'right'
                  ? '128,85 138,90 135,100 125,98'
                  : '58,85 68,90 65,100 55,98'
              }
              fill="#facc15"
              stroke="#a16207"
              strokeWidth="1"
            />
            <text
              x={state.affected === 'right' ? 155 : 40}
              y={90}
              fontSize="7"
              fill="#a16207"
              fontWeight="bold"
            >
              حصاة
            </text>
          </g>
        )}

        {/* Labels */}
        <text x="55" y="35" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          كلية يسرى
        </text>
        <text x="145" y="35" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          كلية يمنى
        </text>
        <text x="95" y="222" textAnchor="middle" fontSize="6" fill="#b45309">
          مثانة
        </text>

        {/* Bilateral affected callout */}
        {state.affected === 'bilateral' && (
          <text x="100" y="15" textAnchor="middle" fontSize="8" fill="#7f1d1d" fontWeight="bold">
            انخفاض ثنائي الجانب
          </text>
        )}
      </svg>
    </div>
  );
}

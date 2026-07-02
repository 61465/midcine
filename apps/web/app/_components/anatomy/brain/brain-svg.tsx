'use client';

import type { BrainState } from './presets';

export function BrainSvg({ state }: { state: BrainState }) {
  const leftDim = state.affectedHemisphere === 'left';
  const rightDim = state.affectedHemisphere === 'right';
  const seizureGlow = state.spikes;

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-4">
      <svg viewBox="0 0 220 200" className="h-full max-h-[420px] w-auto">
        <defs>
          <filter id="seizure-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Left hemisphere (top view) */}
        <g filter={seizureGlow ? 'url(#seizure-glow)' : undefined}>
          <path
            d="M 110 20 C 60 20, 25 60, 30 130 C 35 160, 70 175, 100 170 L 110 170 L 110 20 Z"
            fill={leftDim ? '#9d8ca8' : '#f7d6e0'}
            stroke="#6b21a8"
            strokeWidth="1.5"
          />
          {/* Gyri hints — wavy lines */}
          <path
            d="M 40 60 Q 60 55, 80 65 Q 100 75, 108 65"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 35 90 Q 60 85, 80 95 Q 100 105, 108 95"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 35 120 Q 60 115, 85 125 Q 100 130, 108 125"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 40 150 Q 60 145, 85 155 Q 100 160, 108 155"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
        </g>

        {/* Right hemisphere */}
        <g filter={seizureGlow ? 'url(#seizure-glow)' : undefined}>
          <path
            d="M 110 20 C 160 20, 195 60, 190 130 C 185 160, 150 175, 120 170 L 110 170 L 110 20 Z"
            fill={rightDim ? '#9d8ca8' : '#f7d6e0'}
            stroke="#6b21a8"
            strokeWidth="1.5"
          />
          <path
            d="M 180 60 Q 160 55, 140 65 Q 120 75, 112 65"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 185 90 Q 160 85, 140 95 Q 120 105, 112 95"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 185 120 Q 160 115, 135 125 Q 120 130, 112 125"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
          <path
            d="M 180 150 Q 160 145, 135 155 Q 120 160, 112 155"
            fill="none"
            stroke="#6b21a8"
            strokeWidth="1"
            opacity="0.5"
          />
        </g>

        {/* Longitudinal fissure */}
        <line
          x1="110"
          y1="20"
          x2="110"
          y2="170"
          stroke="#6b21a8"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />

        {/* Cerebellum */}
        <ellipse
          cx="110"
          cy="185"
          rx="35"
          ry="10"
          fill="#e0b4c0"
          stroke="#6b21a8"
          strokeWidth="1"
        />

        {/* Labels */}
        <text x="70" y="100" textAnchor="middle" fontSize="7" fill="#6b21a8">
          نصف أيسر
        </text>
        <text x="150" y="100" textAnchor="middle" fontSize="7" fill="#6b21a8">
          نصف أيمن
        </text>
        <text x="110" y="189" textAnchor="middle" fontSize="6" fill="#6b21a8">
          مخيخ
        </text>

        {/* Affected region callout */}
        {state.affectedHemisphere && (
          <g>
            <circle
              cx={state.affectedHemisphere === 'left' ? 60 : 160}
              cy={110}
              r="30"
              fill="none"
              stroke="#facc15"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
            <text
              x={state.affectedHemisphere === 'left' ? 60 : 160}
              y={140}
              textAnchor="middle"
              fontSize="7"
              fill="#a16207"
              fontWeight="bold"
            >
              نقص تروية
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

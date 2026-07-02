'use client';

import { useEffect, useState } from 'react';
import type { Rhythm } from './presets';

// Lightweight SVG cross-section of the heart, meant for mobile / print.
// Ventricles pulse via CSS transform driven by the BPM.
export function HeartSvg({ rhythm, bpm }: { rhythm: Rhythm; bpm: number }) {
  const [beat, setBeat] = useState(false);

  useEffect(() => {
    const cycleMs = 60000 / bpm;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    function next() {
      if (cancelled) return;
      setBeat(true);
      timer = setTimeout(() => {
        setBeat(false);
        // Irregular timing for afib
        const jitter = rhythm.irregular ? 0.5 + Math.random() * 0.9 : 1;
        timer = setTimeout(next, cycleMs * jitter - 150);
      }, 150);
    }
    next();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bpm, rhythm.irregular]);

  const scale = beat ? 0.94 : 1.0;
  const infarct = rhythm.paralyzedRegion === 'anterior';

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-rose-50 to-white p-4">
      <svg viewBox="0 0 200 220" className="h-full max-h-[420px] w-auto">
        {/* Vessels (aorta arch + pulmonary) */}
        <path
          d="M 100 30 Q 100 10 130 15 Q 155 20 155 55"
          fill="none"
          stroke="#e11d48"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M 100 30 Q 100 10 70 15 Q 45 20 45 55"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {/* Atria (top chambers) */}
        <g
          style={{
            transform: `scale(${beat ? 1.02 : 1.0})`,
            transformOrigin: '100px 60px',
            transition: 'transform 120ms ease-out',
          }}
        >
          <ellipse
            cx="75"
            cy="65"
            rx="22"
            ry="18"
            fill="#fecaca"
            stroke="#dc2626"
            strokeWidth="1.5"
          />
          <ellipse
            cx="125"
            cy="65"
            rx="22"
            ry="18"
            fill="#fecaca"
            stroke="#dc2626"
            strokeWidth="1.5"
          />
        </g>

        {/* Ventricles (bottom chambers) — scale on beat */}
        <g
          style={{
            transform: `scale(${scale})`,
            transformOrigin: '100px 130px',
            transition: 'transform 120ms cubic-bezier(0.4, 0, 0.6, 1)',
          }}
        >
          {/* Left ventricle (thicker wall, larger) */}
          <path
            d="M 100 90 C 145 90, 165 130, 145 175 C 130 200, 105 200, 100 200 Z"
            fill={infarct ? '#7f1d1d' : '#dc2626'}
            stroke="#7f1d1d"
            strokeWidth="2"
          />
          {/* Right ventricle */}
          <path
            d="M 100 90 C 55 90, 35 130, 55 175 C 70 200, 95 200, 100 200 Z"
            fill="#b91c1c"
            stroke="#7f1d1d"
            strokeWidth="2"
          />
          {/* Septum */}
          <line x1="100" y1="90" x2="100" y2="200" stroke="#7f1d1d" strokeWidth="2" />
        </g>

        {/* Labels */}
        <text x="75" y="68" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          أ.ي
        </text>
        <text x="125" y="68" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          أ.ي
        </text>
        <text x="70" y="145" textAnchor="middle" fontSize="7" fill="white">
          ب.ي
        </text>
        <text x="130" y="145" textAnchor="middle" fontSize="7" fill="white">
          ب.ي
        </text>

        {/* Infarct annotation */}
        {infarct && (
          <g>
            <circle
              cx="130"
              cy="120"
              r="14"
              fill="none"
              stroke="#facc15"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
            <text x="130" y="123" textAnchor="middle" fontSize="7" fill="#facc15" fontWeight="bold">
              نقص تروية
            </text>
          </g>
        )}

        {/* Legend */}
        <text x="10" y="215" fontSize="6" fill="#64748b">
          أ.ي = أذين | ب.ي = بطين
        </text>
      </svg>
    </div>
  );
}

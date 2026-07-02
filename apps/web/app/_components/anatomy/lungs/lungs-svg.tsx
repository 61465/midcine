'use client';

import { useEffect, useState } from 'react';
import type { LungState } from './presets';

export function LungsSvg({ state, rr }: { state: LungState; rr: number }) {
  const [phase, setPhase] = useState<'in' | 'out'>('out');
  useEffect(() => {
    const cycleMs = 60000 / rr;
    const iFrac = 1 / (1 + state.ieRatio);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      if (cancelled) return;
      setPhase('in');
      timer = setTimeout(() => {
        setPhase('out');
        timer = setTimeout(tick, cycleMs * (1 - iFrac));
      }, cycleMs * iFrac);
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rr, state.ieRatio]);

  const scale = phase === 'in' ? 1.1 : 1.0;
  const leftDim = state.sideAsymmetric === 'left';
  const rightDim = state.sideAsymmetric === 'right';

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4">
      <svg viewBox="0 0 200 220" className="h-full max-h-[420px] w-auto">
        {/* Trachea */}
        <path d="M 100 15 L 100 70" stroke="#a0616a" strokeWidth="6" strokeLinecap="round" />
        {/* Bronchi */}
        <path d="M 100 70 L 70 95" stroke="#a0616a" strokeWidth="4" strokeLinecap="round" />
        <path d="M 100 70 L 130 95" stroke="#a0616a" strokeWidth="4" strokeLinecap="round" />

        {/* Left lung (2 lobes) */}
        <g
          style={{
            transformOrigin: '60px 130px',
            transform: `scaleY(${scale})`,
            transition: 'transform 400ms ease-in-out',
          }}
        >
          <path
            d="M 60 80 C 30 80, 20 130, 30 180 C 40 200, 65 200, 70 180 L 70 100 Z"
            fill={leftDim ? '#a08088' : '#f4c4ce'}
            stroke="#a0616a"
            strokeWidth="1.5"
          />
          {/* Horizontal fissure */}
          <line
            x1="35"
            y1="140"
            x2="68"
            y2="140"
            stroke="#a0616a"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        </g>

        {/* Right lung (3 lobes, slightly bigger) */}
        <g
          style={{
            transformOrigin: '140px 130px',
            transform: `scaleY(${scale})`,
            transition: 'transform 400ms ease-in-out',
          }}
        >
          <path
            d="M 140 80 C 170 80, 180 130, 170 185 C 160 200, 135 200, 130 180 L 130 100 Z"
            fill={rightDim ? '#a08088' : '#f4c4ce'}
            stroke="#a0616a"
            strokeWidth="1.5"
          />
          {/* 2 fissures */}
          <line
            x1="132"
            y1="120"
            x2="175"
            y2="130"
            stroke="#a0616a"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <line
            x1="132"
            y1="160"
            x2="172"
            y2="165"
            strokeWidth="1"
            stroke="#a0616a"
            strokeDasharray="2 2"
          />
        </g>

        {/* Diaphragm */}
        <path
          d="M 20 200 Q 100 215 180 200"
          fill="none"
          stroke="#8b5a5a"
          strokeWidth="3"
          style={{
            transform: phase === 'in' ? 'translateY(4px)' : 'translateY(0)',
            transition: 'transform 400ms',
          }}
        />

        {/* Labels */}
        <text x="45" y="130" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          رئة يسرى
        </text>
        <text x="155" y="130" textAnchor="middle" fontSize="7" fill="#7f1d1d">
          رئة يمنى
        </text>

        {/* Asymmetry callout */}
        {state.sideAsymmetric && (
          <g>
            <circle
              cx={state.sideAsymmetric === 'left' ? 45 : 155}
              cy={150}
              r="18"
              fill="none"
              stroke="#facc15"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

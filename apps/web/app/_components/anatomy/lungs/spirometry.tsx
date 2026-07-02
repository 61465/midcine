'use client';

import { useEffect, useRef, useState } from 'react';
import type { LungState } from './presets';

// Draw one respiratory cycle: rise (inspiration) then longer fall (expiration).
// Amplitude = tidalVolume. Shape shifts with I:E ratio.
function cyclePath(startX: number, w: number, h: number, state: LungState): string {
  const mid = h / 2;
  const amp = h * 0.35 * state.tidalVolume;
  const iFrac = 1 / (1 + state.ieRatio);
  const iEnd = w * iFrac;
  const steps = 24;
  const pts: string[] = [`M ${startX.toFixed(1)} ${mid.toFixed(1)}`];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = t * w;
    let y: number;
    if (x < iEnd) {
      // Inspiration: sinusoidal rise
      const p = x / iEnd;
      y = mid - amp * Math.sin((p * Math.PI) / 2);
    } else {
      // Expiration: exponential decay (longer for COPD)
      const p = (x - iEnd) / (w - iEnd);
      y = mid - amp * (1 - p) * Math.exp(-p * 0.5);
    }
    pts.push(`L ${(startX + x).toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function Spirometry({ state, rr }: { state: LungState; rr: number }) {
  const W = 1000;
  const H = 240;
  const [offset, setOffset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    const speed = 40;
    function tick(ts: number) {
      if (!mounted) return;
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setOffset((o) => (o + speed * dt) % W);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, []);

  const cycleWidth = Math.max(120, W / Math.max(2, rr / 4));
  const cycles: string[] = [];
  for (let x = -cycleWidth; x < W + cycleWidth; x += cycleWidth) {
    cycles.push(cyclePath(x, cycleWidth, H, state));
  }
  const path = cycles.join(' ');

  return (
    <div className="relative flex h-full w-full flex-col bg-black text-cyan-300">
      <div className="flex items-center justify-between border-b border-cyan-900 px-3 py-1.5 text-[10px] uppercase">
        <span>Spirometry · tidal volume</span>
        <span className="ltr-only">
          {rr} rpm · I:E {state.ieRatio.toFixed(1)}:1
        </span>
      </div>
      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <pattern id="spiro-grid-sm" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0a2a3a" strokeWidth="0.5" />
            </pattern>
            <pattern id="spiro-grid-lg" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#0f4a5a" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#spiro-grid-sm)" />
          <rect width={W} height={H} fill="url(#spiro-grid-lg)" />
          <g transform={`translate(${-offset} 0)`}>
            <path
              d={path}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {/* baseline */}
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#0f4a5a" strokeDasharray="4 3" />
        </svg>
      </div>
    </div>
  );
}

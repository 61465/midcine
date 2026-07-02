'use client';

import { useEffect, useState } from 'react';
import type { BrainState } from './presets';

// Generate a stretch of EEG samples for one channel over W local units.
// Channels: 4 (Fp1, Fp2, C3, C4). Left = Fp1, C3; Right = Fp2, C4.
function synthChannel(
  w: number,
  h: number,
  freq: number,
  spikes: boolean,
  damped: boolean,
  offsetPhase: number,
): string {
  const mid = h / 2;
  const amp = damped ? h * 0.06 : h * 0.18;
  const steps = 240;
  const pts: string[] = [`M 0 ${mid.toFixed(1)}`];
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * w;
    const t = i / steps;
    let y = mid + amp * Math.sin(t * freq * Math.PI * 2 + offsetPhase);
    // add high-freq noise for realism
    y += (Math.random() - 0.5) * (damped ? 2 : 4);
    // spike wave
    if (spikes && Math.random() > 0.985) {
      y = mid - amp * 2 * (Math.random() > 0.5 ? 1 : -1);
    }
    pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

export function EegWaveform({ state }: { state: BrainState }) {
  const W = 1000;
  const H = 60;
  const channels: { id: string; label: string; side: 'left' | 'right' }[] = [
    { id: 'fp1', label: 'Fp1', side: 'left' },
    { id: 'fp2', label: 'Fp2', side: 'right' },
    { id: 'c3', label: 'C3', side: 'left' },
    { id: 'c4', label: 'C4', side: 'right' },
  ];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => (n + 1) % 1e6), 100);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-black text-fuchsia-300">
      <div className="flex items-center justify-between border-b border-fuchsia-900 px-3 py-1.5 text-[10px] uppercase">
        <span>EEG · 4-channel</span>
        <span className="ltr-only">
          {state.dominantFreq} Hz · {state.labelEn}
        </span>
      </div>
      <div className="flex-1 divide-y divide-fuchsia-950">
        {channels.map((c, idx) => {
          const damped = state.affectedHemisphere === c.side;
          const path = synthChannel(
            W,
            H,
            state.dominantFreq,
            state.spikes,
            damped,
            idx + tick * 0.1,
          );
          return (
            <div key={c.id} className="relative h-1/4">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                <path
                  d={path}
                  fill="none"
                  stroke={damped ? '#a78bfa' : '#e879f9'}
                  strokeWidth="1.2"
                />
              </svg>
              <span className="ltr-only absolute right-2 top-1 text-[9px] text-fuchsia-500">
                {c.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

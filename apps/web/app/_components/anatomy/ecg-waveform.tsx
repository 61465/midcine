'use client';

import { useEffect, useRef, useState } from 'react';
import type { Rhythm } from './presets';

// Generate one cardiac cycle as an SVG path segment starting at x=0.
// Width w spans one full RR interval in local x-units.
// Height h is total viewBox height, midline at h/2.
function cyclePath(startX: number, w: number, h: number, rhythm: Rhythm): string {
  const mid = h / 2;
  const p = (x: number, y: number) => `L ${(startX + x).toFixed(1)} ${y.toFixed(1)}`;
  const parts: string[] = [`M ${startX.toFixed(1)} ${mid.toFixed(1)}`];

  // Layout of P, PR, QRS, ST, T within one RR of width w
  // (proportions match a real 12-lead trace)
  const px = w * 0.1,
    py = mid - h * 0.06; // P wave
  const qx = w * 0.22,
    qy = mid + h * 0.05; // Q dip
  const rx = w * 0.25,
    ry = mid - h * 0.35; // R peak
  const sx = w * 0.28,
    sy = mid + h * 0.1; // S dip
  const stx = w * 0.35,
    sty = mid - rhythm.stElevation * (h * 0.03); // ST segment
  const tx = w * 0.52,
    ty = mid - h * 0.12; // T wave
  const endX = w;

  if (rhythm.id === 'afib') {
    // no clear P wave, fibrillatory baseline noise
    for (let i = 0; i < 8; i++) {
      const nx = w * 0.02 + (i / 8) * (w * 0.2);
      const ny = mid + Math.sin(i * 3.1) * h * 0.02 + (Math.random() - 0.5) * h * 0.02;
      parts.push(p(nx, ny));
    }
  } else {
    // P wave: small upward bump around px
    parts.push(p(px - w * 0.03, mid));
    parts.push(p(px, py));
    parts.push(p(px + w * 0.03, mid));
  }

  parts.push(p(qx - w * 0.005, mid));
  parts.push(p(qx, qy));
  parts.push(p(rx, ry));
  parts.push(p(sx, sy));
  parts.push(p(stx, sty));
  parts.push(p(tx - w * 0.05, sty));
  parts.push(p(tx, ty));
  parts.push(p(tx + w * 0.05, mid));
  parts.push(p(endX, mid));
  return parts.join(' ');
}

export function EcgWaveform({ rhythm, bpm }: { rhythm: Rhythm; bpm: number }) {
  // ViewBox dimensions
  const W = 1000;
  const H = 240;
  const [offset, setOffset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    // Effective sweep speed: 25 mm/s classic ECG paper. We scale to viewBox.
    // One cycle width in local units = W * (60/bpm) / 4 (about 4 cycles visible)
    const speed = 60; // local units per second
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

  // Build a repeating waveform across the entire viewBox width
  const cycleWidth = Math.max(80, W / Math.max(2, (bpm / 60) * 4)); // approx 4 cycles/sec visible
  const cycles: string[] = [];
  for (let x = -cycleWidth; x < W + cycleWidth; x += cycleWidth) {
    cycles.push(cyclePath(x, cycleWidth, H, rhythm));
  }
  const fullPath = cycles.join(' ');

  return (
    <div className="relative flex h-full w-full flex-col bg-black text-green-400">
      <div className="flex items-center justify-between border-b border-green-900 px-3 py-1.5 text-[10px] uppercase">
        <span>ECG · Lead II</span>
        <span className="ltr-only">
          {Math.round(bpm)} bpm · {rhythm.labelEn}
        </span>
      </div>
      <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Graph paper grid */}
          <defs>
            <pattern id="ecg-grid-sm" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#0a3a1a" strokeWidth="0.5" />
            </pattern>
            <pattern id="ecg-grid-lg" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#0f5a2a" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#ecg-grid-sm)" />
          <rect width={W} height={H} fill="url(#ecg-grid-lg)" />

          {/* The waveform, scrolled by transform */}
          <g transform={`translate(${-offset} 0)`}>
            <path
              d={fullPath}
              fill="none"
              stroke="#4ade80"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

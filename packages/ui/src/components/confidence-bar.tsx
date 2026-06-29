import * as React from 'react';
import { cn } from '../lib/cn';

interface ConfidenceBarProps {
  value: number; // 0-1
  label?: string;
  className?: string;
}

export function ConfidenceBar({ value, label, className }: ConfidenceBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color =
    value >= 0.85
      ? 'bg-ai-confident'
      : value >= 0.6
        ? 'bg-ai-uncertain'
        : 'bg-ai-conflict';

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full transition-all', color)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

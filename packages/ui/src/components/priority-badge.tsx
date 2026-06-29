import * as React from 'react';
import { cn } from '../lib/cn';
import type { Priority } from '../tokens';

interface PriorityBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  priority: Priority;
  pulse?: boolean;
}

const priorityStyles: Record<Priority, string> = {
  P1: 'bg-priority-p1 text-white',
  P2: 'bg-priority-p2 text-white',
  P3: 'bg-priority-p3 text-white',
  P4: 'bg-priority-p4 text-white',
  P5: 'bg-priority-p5 text-white',
};

const priorityLabels: Record<Priority, string> = {
  P1: 'حرج',
  P2: 'عاجل',
  P3: 'مرتفع',
  P4: 'عادي',
  P5: 'منخفض',
};

export function PriorityBadge({ priority, pulse, className, ...props }: PriorityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        priorityStyles[priority],
        pulse && priority === 'P1' && 'animate-pulse',
        className,
      )}
      {...props}
    >
      {priorityLabels[priority]}
    </span>
  );
}

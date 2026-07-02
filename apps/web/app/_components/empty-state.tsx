import type { LucideIcon } from 'lucide-react';
import { PlugZap } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  hint?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon = PlugZap, title, description, hint, action }: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-brand-800 text-lg font-bold">{title}</div>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
        )}
      </div>
      {hint && (
        <div className="w-full rounded-lg bg-slate-50 p-3 text-right text-[11px] leading-relaxed text-slate-500">
          {hint}
        </div>
      )}
      {action}
    </div>
  );
}

import * as React from 'react';
import { Grid3x3 } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './button';

export interface MidcineApp {
  id: string;
  name: string;
  nameAr: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface AppSwitcherProps {
  apps: MidcineApp[];
  currentAppId: string;
  className?: string;
}

export function AppSwitcher({ apps, currentAppId, className }: AppSwitcherProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label="تبديل التطبيقات"
        aria-expanded={open}
      >
        <Grid3x3 className="h-5 w-5" />
      </Button>

      {open && (
        <div
          className="absolute end-0 top-full z-50 mt-2 w-80 rounded-lg border bg-card p-3 shadow-lg"
          role="menu"
        >
          <div className="grid grid-cols-3 gap-2">
            {apps.map((app) => (
              <a
                key={app.id}
                href={app.url}
                className={cn(
                  'group relative flex flex-col items-center gap-2 rounded-md p-3 text-center transition-colors hover:bg-muted',
                  app.id === currentAppId && 'bg-muted',
                )}
                role="menuitem"
              >
                <app.icon className="h-6 w-6 text-brand-600" />
                <span className="text-xs font-medium">{app.nameAr}</span>
                {app.badge && app.badge > 0 && (
                  <span className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-priority-p1 text-xs text-white">
                    {app.badge > 9 ? '٩+' : app.badge}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

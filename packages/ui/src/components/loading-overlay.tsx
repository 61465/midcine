import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

interface LoadingOverlayProps {
  message?: string;
  fullscreen?: boolean;
  className?: string;
}

export function LoadingOverlay({ message, fullscreen, className }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm',
        fullscreen ? 'fixed inset-0 z-50' : 'h-full w-full',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

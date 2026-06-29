import * as React from 'react';
import { cn } from '../lib/cn';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
}

export function Avatar({ src, alt, fallback, className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        'relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={alt} className="aspect-square h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sm font-medium">
          {fallback ?? '؟'}
        </span>
      )}
    </div>
  );
}

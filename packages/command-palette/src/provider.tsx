'use client';
import * as React from 'react';
import type { CommandSource } from './types';

interface PaletteContextValue {
  sources: CommandSource[];
  registerSource: (source: CommandSource) => () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PaletteContext = React.createContext<PaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [sources, setSources] = React.useState<CommandSource[]>([]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const registerSource = React.useCallback((source: CommandSource) => {
    setSources((prev) => [...prev, source]);
    return () => setSources((prev) => prev.filter((s) => s.id !== source.id));
  }, []);

  return (
    <PaletteContext.Provider value={{ sources, registerSource, open, setOpen }}>
      {children}
    </PaletteContext.Provider>
  );
}

export function usePalette() {
  const ctx = React.useContext(PaletteContext);
  if (!ctx) throw new Error('usePalette must be used within CommandPaletteProvider');
  return ctx;
}

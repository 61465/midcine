'use client';
import * as React from 'react';
import { usePalette } from './provider';
import type { CommandSource } from './types';

export function useCommandSource(source: CommandSource) {
  const { registerSource } = usePalette();
  React.useEffect(() => {
    return registerSource(source);
  }, [registerSource, source]);
}

'use client';

import { useEffect } from 'react';

// Silences known-benign console noise from third-party libs used only inside
// the anatomy lab. Kept scoped to the anatomy page so we don't hide real
// warnings in the rest of the app.
//
// Currently filtered:
//   - "THREE.Clock: This module has been deprecated" — @react-three/fiber 9.6
//     still uses THREE.Clock; three r0.185 warns about it. Not fixable from
//     our side until fiber ships r0.185+ support. Purely informational.

const FILTERED_PATTERNS: RegExp[] = [
  /THREE\.Clock: This module has been deprecated/i,
];

export function ConsoleFilter() {
  useEffect(() => {
    const originalWarn = console.warn;
    const originalLog = console.log;

    function filter(originalFn: typeof console.warn) {
      return function (...args: unknown[]) {
        const first = args[0];
        if (typeof first === 'string' && FILTERED_PATTERNS.some((r) => r.test(first))) {
          return; // swallow
        }
        originalFn(...args);
      };
    }

    console.warn = filter(originalWarn);
    console.log = filter(originalLog);

    return () => {
      console.warn = originalWarn;
      console.log = originalLog;
    };
  }, []);

  return null;
}

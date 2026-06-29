export const colors = {
  brand: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    900: '#0c4a6e',
  },
  priority: {
    p1: '#dc2626',
    p2: '#ea580c',
    p3: '#ca8a04',
    p4: '#16a34a',
    p5: '#6b7280',
  },
  ai: {
    confident: '#16a34a',
    uncertain: '#ca8a04',
    conflict: '#dc2626',
  },
} as const;

export const fonts = {
  arabic: ['"IBM Plex Sans Arabic"', '"Tajawal"', 'system-ui', 'sans-serif'],
  latin: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
  report: ['"IBM Plex Sans Arabic"', '"Amiri"', 'serif'],
} as const;

export const radii = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type Modality = 'CT' | 'MR' | 'CR' | 'DR' | 'US' | 'MG' | 'NM' | 'PT';

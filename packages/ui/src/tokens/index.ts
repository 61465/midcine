// Luxury medical palette — inherits from z.ai "medical_luxury_store" design.
// Navy primary + gold accent + Tajawal Arabic font.

export const colors = {
  brand: {
    50: '#F4F6F9', // bg-body
    100: '#E8EEF5',
    200: '#D4DEEB',
    300: '#B0C0D6',
    400: '#7B8DA6',
    500: '#3B5A87',
    600: '#15305B', // secondary teal
    700: '#0D2240',
    800: '#0A1931', // primary navy
    900: '#070F1E', // deep navy
  },
  gold: {
    50: '#FBF8F1',
    100: '#F3EBD6',
    200: '#DFCDA6', // accent-light
    300: '#D0BB88',
    400: '#C5A059', // accent-gold
    500: '#B8913E', // gold hover
    600: '#98741F',
  },
  priority: {
    p1: '#EF4444', // critical red
    p2: '#F97316',
    p3: '#EAB308',
    p4: '#10B981', // success green
    p5: '#94A3B8',
  },
  ai: {
    confident: '#10B981',
    uncertain: '#EAB308',
    conflict: '#EF4444',
  },
} as const;

export const fonts = {
  arabic: ['"Tajawal"', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
  latin: ['"Tajawal"', '"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
  report: ['"Tajawal"', '"Amiri"', 'serif'],
} as const;

export const radii = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
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

export const shadows = {
  sm: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
  md: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
  lg: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  gold: '0 8px 30px rgba(197, 160, 89, 0.2)',
  navy: '0 8px 25px rgba(10, 25, 49, 0.2)',
} as const;

export type Priority = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type Modality = 'CT' | 'MR' | 'CR' | 'DR' | 'US' | 'MG' | 'NM' | 'PT';

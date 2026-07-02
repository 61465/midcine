import type { Config } from 'tailwindcss';
import { colors, fonts, radii, shadows } from './tokens';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        gold: colors.gold,
        priority: colors.priority,
        ai: colors.ai,

        // Semantic (CSS variables from packages/ui/src/styles/globals.css)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          light: 'hsl(var(--accent-light))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        success: 'hsl(var(--success))',
      },
      fontFamily: {
        sans: fonts.arabic as unknown as string[],
        latin: fonts.latin as unknown as string[],
        mono: fonts.mono as unknown as string[],
        report: fonts.report as unknown as string[],
      },
      borderRadius: radii,
      boxShadow: {
        gold: shadows.gold,
        navy: shadows.navy,
      },
      backgroundImage: {
        'gradient-navy': 'linear-gradient(135deg, #0A1931, #15305B)',
        'gradient-gold': 'linear-gradient(135deg, #C5A059, #DFCDA6)',
        'gradient-navy-to-gold': 'linear-gradient(135deg, #0A1931 0%, #15305B 50%, #C5A059 100%)',
      },
      keyframes: {
        'gold-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'badge-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
      },
      animation: {
        'gold-spin': 'gold-spin 4s linear infinite',
        'fade-in-up': 'fade-in-up 0.8s ease-out forwards',
        'badge-pulse': 'badge-pulse 2s infinite',
      },
    },
  },
  plugins: [],
};

export default preset;

import type { Config } from 'tailwindcss';
import { colors, fonts, radii } from './tokens';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        priority: colors.priority,
        ai: colors.ai,
      },
      fontFamily: {
        sans: fonts.arabic as unknown as string[],
        latin: fonts.latin as unknown as string[],
        mono: fonts.mono as unknown as string[],
        report: fonts.report as unknown as string[],
      },
      borderRadius: radii,
    },
  },
  plugins: [],
};

export default preset;

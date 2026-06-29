import type { Config } from 'tailwindcss';
import preset from '@midcine/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: [
    './app/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/command-palette/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;

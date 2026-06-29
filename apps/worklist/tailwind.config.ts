import type { Config } from 'tailwindcss';
import preset from '@midcine/ui/tailwind-preset';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/command-palette/src/**/*.{ts,tsx}',
  ],
};

export default config;

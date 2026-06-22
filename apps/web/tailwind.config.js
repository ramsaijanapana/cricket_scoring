import { cricketPreset } from '@cricket/ui/tokens';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [cricketPreset],
  content: [
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

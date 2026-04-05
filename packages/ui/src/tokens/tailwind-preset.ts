import { colors } from './colors';
import { fontFamily, fontSize } from './typography';
import { keyframes, animation } from './animations';
import { shadows } from './shadows';

/**
 * Shared Tailwind CSS preset for CricScore.
 *
 * Usage in tailwind.config.js (web or mobile):
 *   const { cricketPreset } = require('@cricket/ui/tokens');
 *   module.exports = { presets: [cricketPreset], ... };
 *
 * Or with the direct path:
 *   presets: [require('@cricket/ui/tokens/tailwind-preset').cricketPreset]
 */
const cricketPreset = {
  theme: {
    screens: {
      'mobile-s': '320px',
      'mobile-l': '360px',
      tablet: '768px',
      desktop: '1024px',
      wide: '1280px',
    },
    extend: {
      colors: {
        cricket: colors.cricket,
        surface: colors.surface,
      },
      fontFamily: {
        sans: fontFamily.sans,
        mono: fontFamily.mono,
      },
      fontSize,
      keyframes,
      animation,
      boxShadow: shadows,
    },
  },
} as const;

export { cricketPreset };
export default cricketPreset;

/**
 * Motion tokens — durations, easings, and spring configs for UI animation.
 */
const springCurve = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    normal: 220,
    slow: 320,
    slower: 480,
  },
  easing: {
    spring: springCurve,
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeInOut: 'cubic-bezier(0.45, 0, 0.55, 1)',
    linear: 'linear',
  },
  spring: {
    snappy: { type: 'spring' as const, stiffness: 400, damping: 25 },
    default: { type: 'spring' as const, stiffness: 300, damping: 25 },
    gentle: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
  transition: {
    fast: `150ms ${springCurve}`,
    normal: '220ms cubic-bezier(0.16, 1, 0.3, 1)',
    slow: '320ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

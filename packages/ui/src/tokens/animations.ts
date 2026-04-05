// Spring easing used across bouncy interactions — overshoots slightly then settles.
// cubic-bezier(0.34, 1.56, 0.64, 1) produces a natural spring feel at 60fps.
const spring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const easeOut = 'cubic-bezier(0.16, 1, 0.3, 1)';
const easeInOut = 'cubic-bezier(0.45, 0, 0.55, 1)';

export const keyframes = {
  // Fade in from transparent
  fadeIn: {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },

  // Slide up from below while fading in — used for modals, toasts, bottom sheets
  slideUp: {
    '0%': { opacity: '0', transform: 'translateY(16px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },

  // Slide down from above while fading in — used for dropdowns, banners
  slideDown: {
    '0%': { opacity: '0', transform: 'translateY(-16px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },

  // Scale in from slightly smaller — used for cards, popovers
  scaleIn: {
    '0%': { opacity: '0', transform: 'scale(0.92)' },
    '100%': { opacity: '1', transform: 'scale(1)' },
  },

  // Gentle breathing pulse — used for live indicators, "recording" dots
  pulseSoft: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.4' },
  },

  // Loading skeleton shimmer — moves highlight left-to-right
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },

  // Score counter increment — number pops up and settles, used when runs are added
  scoreIncrement: {
    '0%': { opacity: '0', transform: 'translateY(12px) scale(0.8)' },
    '60%': { opacity: '1', transform: 'translateY(-4px) scale(1.15)' },
    '80%': { opacity: '1', transform: 'translateY(2px) scale(0.97)' },
    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
  },

  // Ball submission feedback — the ball icon pops outward then snaps back
  ballPop: {
    '0%': { transform: 'scale(1)' },
    '30%': { transform: 'scale(1.35)' },
    '60%': { transform: 'scale(0.88)' },
    '80%': { transform: 'scale(1.08)' },
    '100%': { transform: 'scale(1)' },
  },

  // Spring bounce for button press — press down then spring back past resting
  springBounce: {
    '0%': { transform: 'scale(1)' },
    '25%': { transform: 'scale(0.92)' },
    '55%': { transform: 'scale(1.06)' },
    '75%': { transform: 'scale(0.98)' },
    '100%': { transform: 'scale(1)' },
  },
} as const;

export const animation = {
  // duration | easing | fill-mode (where applicable)
  fadeIn: `fadeIn 200ms ${easeOut} both`,
  slideUp: `slideUp 280ms ${easeOut} both`,
  slideDown: `slideDown 280ms ${easeOut} both`,
  scaleIn: `scaleIn 220ms ${spring} both`,
  pulseSoft: `pulseSoft 2000ms ${easeInOut} infinite`,
  shimmer: `shimmer 1800ms linear infinite`,
  scoreIncrement: `scoreIncrement 480ms ${spring} both`,
  ballPop: `ballPop 420ms ${spring} both`,
  springBounce: `springBounce 360ms ${spring} both`,
} as const;

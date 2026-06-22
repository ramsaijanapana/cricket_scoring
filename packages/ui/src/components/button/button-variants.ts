import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-green-700 text-white hover:bg-green-800 shadow-sm active:scale-[0.97]',
        secondary: 'bg-surface-700 text-white hover:bg-surface-600 active:scale-[0.97]',
        outline: 'border border-[var(--btn-outline-border)] text-[var(--btn-outline-text)] hover:bg-[var(--btn-outline-hover-bg)] hover:border-[var(--btn-outline-hover-border)]',
        ghost: 'text-[var(--btn-ghost-text)] hover:text-[var(--btn-ghost-hover-text)] hover:bg-[var(--btn-ghost-hover-bg)]',
        danger: 'bg-cricket-red text-white hover:opacity-90 active:scale-[0.97]',
      },
      size: {
        sm: 'text-xs px-3 py-1.5',
        md: 'text-sm px-5 py-3',
        lg: 'text-base px-6 py-3.5',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

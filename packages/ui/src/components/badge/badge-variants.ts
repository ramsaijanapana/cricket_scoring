import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider rounded-full',
  {
    variants: {
      variant: {
        default: 'bg-surface-700/50 text-surface-300',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-amber-100 text-amber-800',
        error: 'bg-cricket-red/15 text-cricket-red',
        info: 'bg-cricket-blue/15 text-cricket-blue',
      },
      size: { sm: 'text-[9px] px-1.5 py-0.5', md: 'text-[10px] px-2.5 py-1', lg: 'text-xs px-3 py-1' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;

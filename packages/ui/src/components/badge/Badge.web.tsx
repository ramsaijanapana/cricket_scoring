import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { badgeVariants, type BadgeVariantProps } from './badge-variants';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, BadgeVariantProps {
  children: ReactNode;
  dot?: boolean;
}

export function Badge({ className, variant, size, children, dot, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current inline-block animate-pulse-soft" />}
      {children}
    </span>
  );
}

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, hover = false, padding = 'md', ...props }, ref) => (
    <div ref={ref} className={cn('card', hover && 'card-hover', paddingClasses[padding], className)} {...props}>
      {children}
    </div>
  ),
);

Card.displayName = 'Card';

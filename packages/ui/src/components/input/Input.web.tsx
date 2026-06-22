import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (
      <div className="w-full">
        {label && <label htmlFor={inputId} className="label">{label}</label>}
        <input ref={ref} id={inputId} className={cn('input w-full', error && 'border-cricket-red/50', className)} {...props} />
        {error && <p className="mt-1 text-xs text-cricket-red" role="alert">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

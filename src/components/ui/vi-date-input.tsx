'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CalendarDays } from 'lucide-react';

interface ViDateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
}

function formatViDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

export const ViDateInput = React.forwardRef<HTMLInputElement, ViDateInputProps>(
  ({ value, onChange, disabled, required, className, id }, ref) => {
    const hiddenRef = React.useRef<HTMLInputElement>(null);

    const handleClick = () => {
      if (!disabled && hiddenRef.current) {
        try {
          hiddenRef.current.showPicker();
        } catch {
          hiddenRef.current.focus();
          hiddenRef.current.click();
        }
      }
    };

    return (
      <div
        className={cn(
          'relative flex h-10 w-full cursor-pointer items-center rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )}
        onClick={handleClick}
      >
        <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
        <span className={cn('flex-1 select-none', !value && 'text-muted-foreground')}>
          {value ? formatViDate(value) : 'Chọn ngày'}
        </span>
        <input
          ref={(el) => {
            (hiddenRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) ref.current = el;
          }}
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          tabIndex={-1}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            pointerEvents: 'none',
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    );
  }
);
ViDateInput.displayName = 'ViDateInput';

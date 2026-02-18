'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

interface DebouncedInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
}

const DebouncedInput = React.forwardRef<HTMLInputElement, DebouncedInputProps>(
  ({ value: externalValue, onChange, debounceMs = 300, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(externalValue);
    const timerRef = React.useRef<ReturnType<typeof setTimeout>>();

    React.useEffect(() => {
      setInternalValue(externalValue);
    }, [externalValue]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInternalValue(newValue);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange(newValue);
      }, debounceMs);
    };

    React.useEffect(() => {
      return () => clearTimeout(timerRef.current);
    }, []);

    return (
      <Input
        ref={ref}
        value={internalValue}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
DebouncedInput.displayName = 'DebouncedInput';

export { DebouncedInput };

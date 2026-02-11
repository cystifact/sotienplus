"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number
  onChange?: (value: number) => void
  allowDecimals?: boolean
  prefix?: string
  suffix?: string
  min?: number
  max?: number
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({
    className,
    value,
    onChange,
    allowDecimals = false,
    prefix = '',
    suffix = '',
    min,
    max,
    ...props
  }, ref) => {
    // Format number with thousand separators: 10,500.7
    const formatNumber = (num: number | undefined): string => {
      if (num === undefined || isNaN(num) || num === 0) return ''

      const parts = num.toString().split('.')
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')

      let result = parts.join('.')
      if (prefix) result = prefix + result
      if (suffix) result = result + suffix

      return result
    }

    // Parse number from formatted string
    const parseNumber = (str: string): number => {
      if (!str) return 0

      // Remove prefix, suffix and thousand separators
      let cleanStr = str
      if (prefix) cleanStr = cleanStr.replace(prefix, '')
      if (suffix) cleanStr = cleanStr.replace(suffix, '')
      cleanStr = cleanStr.replace(/,/g, '')

      const num = parseFloat(cleanStr)
      return isNaN(num) ? 0 : num
    }

    const [displayValue, setDisplayValue] = React.useState<string>(() => formatNumber(value))
    const [isFocused, setIsFocused] = React.useState(false)

    // Update display when value prop changes (only when not focused)
    React.useEffect(() => {
      if (!isFocused && value !== undefined) {
        setDisplayValue(formatNumber(value))
      } else if (!isFocused && value === undefined) {
        setDisplayValue('')
      }
    }, [value, isFocused])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value

      // Remove prefix and suffix for processing
      let cleanValue = inputValue
      if (prefix) cleanValue = cleanValue.replace(prefix, '')
      if (suffix) cleanValue = cleanValue.replace(suffix, '')

      // Allow only numbers, comma, and decimal point
      const allowedPattern = allowDecimals ? /[^0-9,.]/g : /[^0-9,]/g
      cleanValue = cleanValue.replace(allowedPattern, '')

      // Remove extra commas (they are just formatting)
      cleanValue = cleanValue.replace(/,/g, '')

      // Handle decimal point
      if (allowDecimals) {
        const parts = cleanValue.split('.')
        if (parts.length > 2) {
          cleanValue = parts[0] + '.' + parts.slice(1).join('')
        }
      }

      // Format with thousand separators
      let formatted = cleanValue
      if (cleanValue) {
        const parts = cleanValue.split('.')
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        formatted = parts.join('.')
      }

      // Add prefix/suffix
      if (prefix && formatted) formatted = prefix + formatted
      if (suffix && formatted) formatted = formatted + suffix

      setDisplayValue(formatted)

      // Parse and validate
      const numValue = parseNumber(formatted)
      let finalValue = numValue
      if (min !== undefined && numValue < min) finalValue = min
      if (max !== undefined && numValue > max) finalValue = max

      onChange?.(finalValue)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      // Keep formatted value on focus for better UX
      // Select all text for easy replacement
      setTimeout(() => e.target.select(), 0)
      props.onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      // Re-format on blur
      const numValue = parseNumber(displayValue)
      setDisplayValue(formatNumber(numValue || undefined))
      props.onBlur?.(e)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, decimal point, arrows
      if (
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.key === 'Tab' ||
        e.key === 'Escape' ||
        e.key === 'Enter' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'Home' ||
        e.key === 'End' ||
        (allowDecimals && e.key === '.') ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.ctrlKey && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase()))
      ) {
        return
      }

      // Block non-numeric keys
      if (!/^\d$/.test(e.key)) {
        e.preventDefault()
      }

      props.onKeyDown?.(e)
    }

    return (
      <Input
        className={cn("text-right", className)}
        ref={ref}
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }

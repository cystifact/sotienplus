"use client"

import * as React from "react"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface ComboboxOption {
  label: string;
  value: string;
  searchText?: string; // Additional text to search in
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholderText?: string
  disabled?: boolean
}

// Normalize Vietnamese text for fuzzy matching
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

// Fuzzy search: check if all search words exist in text (in any order)
function fuzzyMatch(text: string, search: string): boolean {
  const normalizedText = normalizeText(text)
  const searchWords = normalizeText(search).split(/\s+/).filter(Boolean)

  // All search words must be found in text
  return searchWords.every(word => normalizedText.includes(word))
}

export const Combobox = React.forwardRef<HTMLInputElement, ComboboxProps>(
  ({ options, value, onChange, placeholderText, disabled }, ref) => {
  const [inputValue, setInputValue] = React.useState('')
  const [isOpen, setIsOpen] = React.useState(false)
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  // Expose focus method via ref
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value)

  // Filter options based on fuzzy search
  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) return []

    return options.filter((opt) => {
      // Search in label and searchText (if provided)
      const searchTarget = opt.searchText
        ? `${opt.label} ${opt.searchText}`
        : opt.label
      return fuzzyMatch(searchTarget, inputValue)
    }).slice(0, 10) // Limit to 10 results
  }, [inputValue, options])

  // Reset highlighted index when filtered options change
  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  // Handle click outside to close
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        // Reset input if no selection made
        if (!value) {
          setInputValue('')
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  // Update input when value changes externally
  React.useEffect(() => {
    if (selectedOption) {
      setInputValue(selectedOption.label)
    } else {
      setInputValue('')
    }
  }, [selectedOption])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    setIsOpen(val.length > 0)
    // Clear selection if user starts typing something different
    if (selectedOption && val !== selectedOption.label) {
      onChange('')
    }
  }

  const handleSelect = (option: ComboboxOption) => {
    onChange(option.value)
    setInputValue(option.label)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleClear = () => {
    onChange('')
    setInputValue('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleFocus = () => {
    if (inputValue.length > 0 && !value) {
      setIsOpen(true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen && inputValue.length > 0) {
        setIsOpen(true)
      } else if (filteredOptions.length > 0) {
        setHighlightedIndex(prev =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredOptions.length > 0) {
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        )
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (isOpen && filteredOptions.length > 0) {
        handleSelect(filteredOptions[highlightedIndex])
      }
    }
  }

  // Scroll highlighted item into view
  React.useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText || "Nhập để tìm..."}
          disabled={disabled}
          className={cn("pr-8", value ? "border-primary" : "")}
        />
        {value && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full w-8 hover:bg-transparent"
            onClick={handleClear}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <ul ref={listRef} className="max-h-60 overflow-auto py-1">
            {filteredOptions.map((option, index) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex cursor-pointer items-center px-3 py-2 text-sm",
                  index === highlightedIndex && "bg-accent",
                  value === option.value && "font-medium"
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 flex-shrink-0",
                    value === option.value ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOpen && inputValue.length > 0 && filteredOptions.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 shadow-lg">
          <p className="text-sm text-muted-foreground text-center">Không tìm thấy</p>
        </div>
      )}
    </div>
  )
})

Combobox.displayName = "Combobox"

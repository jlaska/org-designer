import { useRef, useState } from 'react'
import { X } from 'lucide-react'

export interface ComboBoxOption {
  id: string
  label: string
}

interface TagComboBoxProps {
  items: ComboBoxOption[]
  suggestions: ComboBoxOption[]
  inputValue: string
  onInputChange: (value: string) => void
  onSelect: (option: ComboBoxOption) => void
  onCreate?: (label: string) => void
  onRemove: (id: string) => void
  canCreate: boolean
  placeholder: string
  totalCount: number
  noun: string
}

/**
 * A single-box, type-ahead tag input: selected chips and the text cursor
 * live inside one bordered container (e.g. Gmail's "To:" field), with a
 * floating suggestion list below. No external dependency.
 */
export function TagComboBox({
  items,
  suggestions,
  inputValue,
  onInputChange,
  onSelect,
  onCreate,
  onRemove,
  canCreate,
  placeholder,
  totalCount,
  noun,
}: TagComboBoxProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = (option: ComboBoxOption) => {
    onSelect(option)
    onInputChange('')
    inputRef.current?.focus()
  }

  const handleCreate = () => {
    const trimmed = inputValue.trim()
    if (!trimmed || !onCreate) return
    onCreate(trimmed)
    onInputChange('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions.length > 0) {
        handleSelect(suggestions[0])
      } else if (canCreate) {
        handleCreate()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'Backspace' && inputValue === '' && items.length > 0) {
      onRemove(items[items.length - 1].id)
    }
  }

  return (
    <div className="relative">
      <div
        className="flex min-h-[32px] flex-wrap items-center gap-1 rounded border border-gray-200 bg-white p-1.5 focus-within:border-blue-400"
        onClick={() => inputRef.current?.focus()}
      >
        {items.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
          >
            {item.label}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(item.id)
              }}
              className="text-blue-600 hover:text-blue-800"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={items.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 border-none bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
          {suggestions.length > 0 ? (
            suggestions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                {opt.label}
              </button>
            ))
          ) : inputValue ? (
            <div className="px-3 py-2 text-xs text-gray-400">No matching {noun}s</div>
          ) : (
            <div className="px-3 py-2 text-xs text-gray-500">
              {totalCount === 0
                ? `No ${noun}s available`
                : `${totalCount} ${noun}${totalCount === 1 ? '' : 's'}`}
            </div>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={handleCreate}
              className="w-full px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              Create &quot;{inputValue.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

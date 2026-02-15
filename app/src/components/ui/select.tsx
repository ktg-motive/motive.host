import { type SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export default function Select({ label, error, className = '', id, children, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`w-full rounded-lg border border-border bg-card px-4 py-2.5 text-muted-white focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

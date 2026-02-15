'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-3xl font-bold text-muted-white">Something went wrong</h1>
        <p className="mt-3 text-sm text-slate">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/ui/card'

interface SearchResult {
  domain: string
  status: 'available' | 'taken' | 'error'
  price?: number
}

interface SearchResponse {
  exact: SearchResult
  suggestions: SearchResult[]
}

function SearchForm() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery ?? query
    if (!q.trim()) return

    setLoading(true)
    setSearched(true)

    try {
      const res = await fetch('/api/domains/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      })
      if (!res.ok) {
        setResults(null)
        return
      }
      const data = await res.json()
      setResults(data)
    } catch {
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [query])

  // Auto-search if ?q= param is present
  useEffect(() => {
    const q = searchParams.get('q')
    if (q?.trim()) {
      handleSearch(q.trim())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleSearch()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl font-bold text-muted-white">Find Your Domain</h1>
        <p className="mt-3 text-slate">
          Search for the perfect domain name for your business
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="mb-10 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a domain name (e.g. mybusiness.com)"
          className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-gold px-6 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && results && (
        <div className="space-y-8">
          {/* Exact match */}
          <Card className={results.exact.status === 'available'
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-red-500/20 bg-red-500/5'
          }>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-mono text-lg font-medium text-muted-white">
                  {results.exact.domain}
                </h2>
                <p className={`mt-1 text-sm ${results.exact.status === 'available' ? 'text-green-400' : 'text-red-400'}`}>
                  {results.exact.status === 'available' ? 'Available' : 'Taken'}
                </p>
              </div>
              {results.exact.status === 'available' && (
                <div className="flex items-center gap-4">
                  {results.exact.price !== undefined && (
                    <span className="text-2xl font-bold text-gold">
                      ${results.exact.price}/yr
                    </span>
                  )}
                  <Link
                    href={`/register?domain=${encodeURIComponent(results.exact.domain)}`}
                    className="rounded-lg bg-gold px-5 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {/* Suggestions */}
          {results.suggestions.length > 0 && (
            <div>
              <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate">
                More Options
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.suggestions.map((s) => (
                  <Card key={s.domain} className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-mono text-sm text-muted-white">{s.domain}</p>
                      {s.price !== undefined && (
                        <p className="mt-0.5 text-sm text-gold">${s.price}/yr</p>
                      )}
                    </div>
                    <Link
                      href={`/register?domain=${encodeURIComponent(s.domain)}`}
                      className="rounded-lg border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-gold hover:text-primary-bg"
                    >
                      Register
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No results state */}
      {!loading && searched && !results && (
        <Card className="text-center">
          <p className="text-slate">Something went wrong. Please try again.</p>
        </Card>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchForm />
    </Suspense>
  )
}

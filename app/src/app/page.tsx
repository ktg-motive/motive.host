'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()
  const [query, setQuery] = useState('')

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-8 px-4 text-center">
        <div>
          <p className="font-mono text-sm tracking-widest text-gold">CUSTOMER HUB</p>
          <h1 className="mt-3 font-display text-5xl font-bold tracking-tight text-muted-white">
            Motive Hosting
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-slate">
            Domain registration and DNS management for Gulf Coast businesses.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex w-full max-w-lg gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a domain name..."
            className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
          <button
            type="submit"
            className="rounded-lg bg-gold px-6 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/search" className="text-slate transition-colors hover:text-gold">
            Browse Domains
          </Link>
          <span className="text-border">|</span>
          <Link href="/login" className="text-slate transition-colors hover:text-gold">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}

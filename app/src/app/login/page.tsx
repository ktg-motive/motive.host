'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Validate redirect is a safe relative path (prevent open redirect)
  const rawRedirect = searchParams.get('redirect') || '/domains'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/domains'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold text-muted-white">Sign In</h1>
        <p className="mt-2 text-sm text-slate">
          Welcome back to Motive Hosting
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gold px-4 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate">
        <Link href="/forgot-password" className="text-gold hover:text-gold-hover">
          Forgot your password?
        </Link>
      </p>

      <div className="mt-6 border-t border-border pt-6">
        <p className="mb-3 text-center text-sm text-slate">Don&apos;t have an account?</p>
        <a
          href="https://motive.host/contact.html"
          className="block w-full rounded-lg border-2 border-gold px-4 py-3 text-center font-medium text-gold transition-colors hover:bg-gold hover:text-primary-bg"
        >
          Get Started with Motive Hosting
        </a>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}

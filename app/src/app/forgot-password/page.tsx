'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-muted-white">Reset Password</h1>
          <p className="mt-2 text-sm text-slate">
            We&apos;ll send you a link to reset your password.
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-6 text-center">
            <p className="text-sm text-green-400">
              Check your email for a password reset link.
            </p>
            <p className="mt-2 text-xs text-slate">
              Didn&apos;t get it? Check your spam folder or try again.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-gold hover:text-gold-hover"
            >
              Send again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gold px-4 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate">
          Remember your password?{' '}
          <Link href="/login" className="text-gold hover:text-gold-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Nav() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    router.push('/')
    router.refresh()
  }

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-lg font-bold text-muted-white">
            Motive Hosting
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/search"
              className="text-sm text-slate transition-colors hover:text-muted-white"
            >
              Search
            </Link>
            {user && (
              <Link
                href="/domains"
                className="text-sm text-slate transition-colors hover:text-muted-white"
              >
                My Domains
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-slate">{user.email}</span>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-gold px-3 py-1.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

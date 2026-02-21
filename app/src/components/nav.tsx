'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Nav() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  function closeMenus() {
    setMobileOpen(false)
    setDropdownOpen(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setDropdownOpen(false)
    router.push('/')
    router.refresh()
  }

  function navLinks(onNavigate?: () => void) {
    if (!user) return null

    return (
      <>
        <Link
          href="/"
          onClick={onNavigate}
          className={`text-sm transition-colors hover:text-muted-white ${
            pathname === '/' ? 'text-gold' : 'text-slate'
          }`}
        >
          Dashboard
        </Link>
        <Link
          href="/hosting"
          onClick={onNavigate}
          className={`text-sm transition-colors hover:text-muted-white ${
            pathname.startsWith('/hosting') ? 'text-gold' : 'text-slate'
          }`}
        >
          Hosting
        </Link>
        <Link
          href="/domains"
          onClick={onNavigate}
          className={`text-sm transition-colors hover:text-muted-white ${
            pathname.startsWith('/domains') ? 'text-gold' : 'text-slate'
          }`}
        >
          Domains
        </Link>
        <Link
          href="/email"
          onClick={onNavigate}
          className={`text-sm transition-colors hover:text-muted-white ${
            pathname.startsWith('/email') ? 'text-gold' : 'text-slate'
          }`}
        >
          Email
        </Link>
      </>
    )
  }

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* Left: logo + desktop links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="font-display text-lg font-bold text-muted-white">
            Motive Hosting
          </Link>
          <div className="hidden items-center gap-4 sm:flex">
            {navLinks()}
          </div>
        </div>

        {/* Right: desktop auth */}
        <div className="hidden items-center gap-3 sm:flex">
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
              >
                <span className="max-w-[160px] truncate">{user.email}</span>
                <svg className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-lg">
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-xs text-slate">{user.email}</p>
                  </div>
                  <span
                    className="block cursor-default px-3 py-2 text-sm text-slate/50"
                  >
                    Account
                  </span>
                  <div className="border-t border-border">
                    <button
                      onClick={handleLogout}
                      className="w-full px-3 py-2 text-left text-sm text-slate transition-colors hover:bg-card-content hover:text-red-400"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
            >
              Log in
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex items-center justify-center sm:hidden"
          aria-label="Toggle menu"
        >
          <svg className="h-6 w-6 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 pb-4 pt-2 sm:hidden">
          <div className="flex flex-col gap-3">
            {navLinks(closeMenus)}
            {user ? (
              <>
                <div className="border-t border-border pt-3">
                  <p className="truncate text-xs text-slate">{user.email}</p>
                </div>
                <span className="cursor-default text-sm text-slate/50">
                  Account
                </span>
                <button
                  onClick={handleLogout}
                  className="text-left text-sm text-slate transition-colors hover:text-red-400"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="border-t border-border pt-3">
                <Link
                  href="/login"
                  className="block rounded-lg border border-border px-3 py-2 text-center text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
                >
                  Log in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { validateCsrf } from '@/lib/csrf'

// Routes that never require auth or a plan
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/no-plan',
  '/auth',
]

// Page routes that require both auth and an active plan
const PROTECTED_PAGE_PREFIXES = [
  '/domains',
  '/search',
  '/register',
  '/email',
  '/transfer',
  '/hosting',
  '/account',
  '/admin',
]

// API routes that require both auth and an active plan
const PROTECTED_API_PREFIXES = [
  '/api/domains',
  '/api/email',
  '/api/transfers',
  '/api/admin',
  '/api/hosting',
  '/api/account',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname

  // Let public paths through immediately (login, forgot-password, etc.)
  // No CSRF check needed — these forms don't have session cookies to protect.
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    await supabase.auth.getUser() // still needed to refresh session cookies
    return supabaseResponse
  }

  // CSRF protection for all mutation requests (POST/PUT/PATCH/DELETE)
  // Runs before auth so forged requests never hit the database.
  const csrfResponse = validateCsrf(request)
  if (csrfResponse) {
    return csrfResponse
  }

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p))
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))

  // Not a protected route — let it through
  if (!isProtectedPage && !isProtectedApi) {
    await supabase.auth.getUser()
    return supabaseResponse
  }

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Plan check — one lightweight query (admins bypass the plan requirement)
  const { data: customer } = await supabase
    .from('customers')
    .select('plan, is_admin')
    .eq('id', user.id)
    .single()

  if (!customer?.plan && !customer?.is_admin) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'No active hosting plan. Contact us at motive.host/contact.html' },
        { status: 403 }
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/no-plan'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

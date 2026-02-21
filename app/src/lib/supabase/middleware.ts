import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
]

// API routes that require both auth and an active plan
const PROTECTED_API_PREFIXES = [
  '/api/domains',
  '/api/email',
  '/api/transfers',
  '/api/admin',
  '/api/hosting',
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

  // Let public paths through immediately
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    await supabase.auth.getUser() // still needed to refresh session cookies
    return supabaseResponse
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

  // Plan check — one lightweight query
  const { data: customer } = await supabase
    .from('customers')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!customer?.plan) {
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

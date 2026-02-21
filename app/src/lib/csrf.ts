import { NextResponse, type NextRequest } from 'next/server'

/**
 * CSRF protection via Origin/Referer header validation.
 *
 * For non-GET/HEAD/OPTIONS methods, verifies that the request
 * originates from an allowed host. Returns null if the request
 * is safe, or a 403 NextResponse if it fails validation.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase()

  // Safe methods are exempt from CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return null
  }

  const allowedHosts = getAllowedHosts()
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')

  // Check Origin header first (most reliable)
  if (origin) {
    try {
      const originHost = new URL(origin).host
      if (allowedHosts.has(originHost)) {
        return null // safe
      }
    } catch {
      // Malformed origin -- fall through to reject
    }
    return NextResponse.json(
      { error: 'Forbidden: cross-origin request blocked' },
      { status: 403 }
    )
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererHost = new URL(referer).host
      if (allowedHosts.has(refererHost)) {
        return null // safe
      }
    } catch {
      // Malformed referer -- fall through to reject
    }
    return NextResponse.json(
      { error: 'Forbidden: cross-origin request blocked' },
      { status: 403 }
    )
  }

  // Neither Origin nor Referer present on a mutation request.
  // Modern browsers always send at least one on POST/PUT/PATCH/DELETE.
  // Absence means either a non-browser client (which won't have cookies
  // anyway) or a privacy proxy stripping headers. Reject to be safe.
  return NextResponse.json(
    { error: 'Forbidden: missing origin information' },
    { status: 403 }
  )
}

/**
 * Build the set of allowed hostnames from the app's configured URL.
 * Cached after first call since these values don't change at runtime.
 */
let _allowedHosts: Set<string> | null = null

function getAllowedHosts(): Set<string> {
  if (_allowedHosts) return _allowedHosts

  const hosts = new Set<string>()

  // Primary: the app's own URL
  // In production this is my.motive.host; in dev it's localhost:3000
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (appUrl) {
    try {
      // Handle both "https://my.motive.host" and bare "my.motive.host"
      const url = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`
      hosts.add(new URL(url).host)
    } catch {
      // Invalid URL in env -- skip
    }
  }

  // Always allow localhost for development
  if (process.env.NODE_ENV === 'development') {
    hosts.add('localhost:3000')
    hosts.add('127.0.0.1:3000')
  }

  // Hardcode production host as a safety net
  hosts.add('my.motive.host')

  _allowedHosts = hosts
  return _allowedHosts
}

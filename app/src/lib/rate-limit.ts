// Simple in-memory rate limiter for API routes.
// For single-process deployments (PM2 single instance). Use Redis for multi-instance.

const hits = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup to prevent memory leaks from stale entries
const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) {
      hits.delete(key)
    }
  }
}

/**
 * Extract client IP from request headers.
 * Uses the rightmost x-forwarded-for value (closest trusted proxy hop)
 * to resist spoofing via prepended headers. Falls back to 'unknown'.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    // Rightmost entry is set by the closest trusted reverse proxy (Nginx/RunCloud)
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return 'unknown'
}

/**
 * Check if a request is within rate limits.
 * Returns { allowed: true } or { allowed: false, retryAfter } in seconds.
 */
export function rateLimit(
  ip: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  cleanup()

  const now = Date.now()
  const entry = hits.get(ip)

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { allowed: true }
}

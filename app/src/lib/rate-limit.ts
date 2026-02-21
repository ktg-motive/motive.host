// Simple in-memory rate limiter for API routes.
// For single-process deployments (PM2 single instance). Use Redis for multi-instance.

// Proxy chain assumption (motive.host production):
//   Client -> nginx-rc (144.202.27.86) -> Node.js (localhost)
//
// nginx sets X-Real-IP to $remote_addr and appends to X-Forwarded-For.
// TRUSTED_PROXY_DEPTH = 1. If a CDN is added in front of nginx, increase to 2.

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
 * Trusted proxy depth: how many proxies sit between the client and this
 * Node.js process. For single-nginx deployments (RunCloud), this is 1.
 * Increase if a CDN or load balancer is added in front of nginx.
 */
const TRUSTED_PROXY_DEPTH = 1

/**
 * Extract the client IP from request headers using a trust-aware strategy.
 *
 * Priority:
 * 1. X-Real-IP — set by nginx to $remote_addr (single authoritative value)
 * 2. X-Forwarded-For — walk backwards, skipping TRUSTED_PROXY_DEPTH entries
 * 3. Fallback to 'unknown' (all such requests share one bucket -- acceptable
 *    because this only happens for health checks or direct-to-Node requests,
 *    which should not occur in production)
 *
 * IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) are normalized to plain IPv4.
 */
export function getClientIp(request: Request): string {
  // 1. Prefer X-Real-IP (set by nginx, not spoofable through the proxy)
  const xRealIp = request.headers.get('x-real-ip')
  if (xRealIp) {
    return normalizeIp(xRealIp.trim())
  }

  // 2. Fall back to X-Forwarded-For with trusted-proxy-aware parsing
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    // The entry at position (length - TRUSTED_PROXY_DEPTH) is the client IP.
    // With depth=1 (nginx only), this is the last entry nginx appended.
    // With depth=2 (CDN + nginx), this skips the CDN's IP.
    const clientIndex = parts.length - TRUSTED_PROXY_DEPTH
    if (clientIndex >= 0 && parts[clientIndex]) {
      return normalizeIp(parts[clientIndex])
    }
    // If the header has fewer entries than our trust depth, take the first
    // (it's the only candidate and may be the real client)
    if (parts.length > 0) {
      return normalizeIp(parts[0])
    }
  }

  return 'unknown'
}

/**
 * Normalize IPv4-mapped IPv6 addresses to plain IPv4.
 * e.g. "::ffff:192.168.1.1" -> "192.168.1.1"
 */
function normalizeIp(ip: string): string {
  const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i
  const match = ip.match(v4Mapped)
  return match ? match[1] : ip
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

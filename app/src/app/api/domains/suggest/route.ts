import { NextResponse } from 'next/server'
import { createOpenSRSClient } from '@opensrs'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

// 30 suggestions per minute per IP (lightweight endpoint, slightly higher limit)
const RATE_LIMIT = 30
const RATE_WINDOW = 60_000

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const check = rateLimit(ip, RATE_LIMIT, RATE_WINDOW)
    if (!check.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(check.retryAfter) } }
      )
    }

    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    const suggestions = await opensrs.suggestDomains(query)

    return NextResponse.json({
      suggestions: suggestions
        .filter((s) => s.status === 'available')
        .slice(0, 8)
        .map((s) => ({ domain: s.domain })),
    })
  } catch (error) {
    console.error('Domain suggest error:', error)
    return NextResponse.json({ error: 'Suggestion failed' }, { status: 500 })
  }
}

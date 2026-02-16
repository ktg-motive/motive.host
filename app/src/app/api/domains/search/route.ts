import { NextResponse } from 'next/server'
import { createOpenSRSClient } from '@opensrs'
import { getCustomerPrice } from '@/lib/pricing'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

// 20 searches per minute per IP
const RATE_LIMIT = 20
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

    const domain = query.includes('.') ? query.trim() : `${query.trim()}.com`

    // Run exact check and suggestions in parallel
    const [exactResult, suggestions] = await Promise.all([
      opensrs.checkAvailability(domain),
      opensrs.suggestDomains(query),
    ])

    // Get prices for available domains
    let exactPrice: number | undefined
    if (exactResult.status === 'available') {
      try {
        const priceResult = await opensrs.getDomainPrice(domain)
        exactPrice = getCustomerPrice(priceResult.price)
      } catch {
        // Price lookup failed — still show as available without price
      }
    }

    // Get prices for available suggestions (limit to first 6)
    const availableSuggestions = suggestions
      .filter((s) => s.status === 'available' && s.domain !== domain)
      .slice(0, 6)

    const suggestionsWithPrices = await Promise.all(
      availableSuggestions.map(async (s) => {
        try {
          const priceResult = await opensrs.getDomainPrice(s.domain)
          return { domain: s.domain, status: s.status, price: getCustomerPrice(priceResult.price) }
        } catch {
          return { domain: s.domain, status: s.status, price: undefined }
        }
      })
    )

    return NextResponse.json({
      exact: {
        domain,
        status: exactResult.status,
        price: exactPrice,
      },
      suggestions: suggestionsWithPrices,
    })
  } catch (error) {
    console.error('Domain search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

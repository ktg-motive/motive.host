import { NextResponse } from 'next/server'
import { createOpenSRSClient } from '@opensrs'
import { getCustomerPrice } from '@/lib/pricing'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { validateDomainQuery } from '@/lib/domain-validation'
import { getTldRules } from '@/lib/tld-rules'

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

    const validation = validateDomainQuery(query)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const domain = validation.domain.includes('.') ? validation.domain : `${validation.domain}.com`

    // Run exact check and suggestions in parallel
    const [exactResult, suggestions] = await Promise.all([
      opensrs.checkAvailability(domain),
      opensrs.suggestDomains(query),
    ])

    // Get quote (respecting per-TLD min period) for the exact domain.
    // We return the total for `minPeriod` years — authoritative, no derivation.
    let exactPrice: number | undefined
    let exactPriceError: string | undefined
    const exactRules = getTldRules(domain)

    if (exactResult.status === 'available') {
      try {
        const priceResult = await opensrs.getDomainPrice(domain, exactRules.minPeriod)
        exactPrice = getCustomerPrice(priceResult.price)
      } catch (err) {
        console.error('Price lookup failed for exact domain', { domain, err })
        exactPriceError = 'Pricing is temporarily unavailable for this domain.'
      }
    }

    // Suggestions — same deal, each at its own min period
    const availableSuggestions = suggestions
      .filter((s) => s.status === 'available' && s.domain !== domain)
      .slice(0, 6)

    const suggestionsWithPrices = await Promise.all(
      availableSuggestions.map(async (s) => {
        const rules = getTldRules(s.domain)
        try {
          const priceResult = await opensrs.getDomainPrice(s.domain, rules.minPeriod)
          return {
            domain: s.domain,
            status: s.status,
            price: getCustomerPrice(priceResult.price),
            minPeriod: rules.minPeriod,
          }
        } catch (err) {
          console.error('Price lookup failed for suggestion', { domain: s.domain, err })
          return {
            domain: s.domain,
            status: s.status,
            price: undefined,
            minPeriod: rules.minPeriod,
          }
        }
      })
    )

    return NextResponse.json({
      exact: {
        domain,
        status: exactResult.status,
        price: exactPrice,
        minPeriod: exactRules.minPeriod,
        periodNote: exactRules.minPeriod > 1 ? exactRules.note : undefined,
        priceError: exactPriceError,
      },
      suggestions: suggestionsWithPrices,
    })
  } catch (error) {
    console.error('Domain search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

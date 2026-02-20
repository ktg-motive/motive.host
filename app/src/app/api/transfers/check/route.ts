import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { validateDomain } from '@/lib/domain-validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

const RATE_WINDOW = 60_000
const CHECK_LIMIT = 10

const checkSchema = z.object({
  domain: z.string().min(1).superRefine((val, ctx) => {
    const result = validateDomain(val)
    if (!result.valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error })
    }
  }).transform((val) => {
    const result = validateDomain(val)
    return result.valid ? result.domain : val
  }),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const check = rateLimit(`transfer:check:${ip}`, CHECK_LIMIT, RATE_WINDOW)
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(check.retryAfter) } }
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = checkSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { domain } = parsed.data

    // Check if user already has this domain in their account
    const { data: existingDomain } = await supabase
      .from('domains')
      .select('id, status')
      .eq('customer_id', user.id)
      .eq('domain_name', domain)
      .single()

    if (existingDomain) {
      return NextResponse.json({
        eligible: false,
        reason: 'This domain is already managed in your account.',
        price_cents: null,
      })
    }

    // Check transfer eligibility at OpenSRS
    const eligibility = await opensrs.checkTransferEligibility(domain)

    if (!eligibility.eligible) {
      return NextResponse.json({
        eligible: false,
        reason: eligibility.reason,
        price_cents: null,
      })
    }

    // Get wholesale transfer price (pass-through, no markup)
    const priceResult = await opensrs.getTransferPrice(domain, 1)
    const priceCents = Math.round(priceResult.price * 100)

    return NextResponse.json({
      eligible: true,
      reason: null,
      price_cents: priceCents,
      currency: 'usd',
      tld: domain.split('.').slice(1).join('.'),
      years: 1,
    })
  } catch (error) {
    console.error('Transfer check error:', error)
    return NextResponse.json({ error: 'Failed to check transfer eligibility' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createOpenSRSClient } from '@opensrs'
import { getCustomerPrice } from '@/lib/pricing'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { validateDomain } from '@/lib/domain-validation'
import { getTldRules } from '@/lib/tld-rules'
import { createClient } from '@/lib/supabase/server'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

const RATE_LIMIT = 30
const RATE_WINDOW = 60_000

export const quoteSchema = z
  .object({
    domain: z
      .string()
      .min(1)
      .superRefine((val, ctx) => {
        const r = validateDomain(val)
        if (!r.valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error })
      })
      .transform((val) => {
        const r = validateDomain(val)
        return r.valid ? r.domain : val
      }),
    period: z.number().int().min(1).max(10),
  })
  .superRefine((data, ctx) => {
    const rules = getTldRules(data.domain)
    if (data.period < rules.minPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['period'],
        message: rules.note ?? `Minimum period for this TLD is ${rules.minPeriod} years.`,
      })
    }
    if (data.period > rules.maxPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['period'],
        message: `Maximum period for this TLD is ${rules.maxPeriod} years.`,
      })
    }
  })

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const check = rateLimit(`quote:${ip}`, RATE_LIMIT, RATE_WINDOW)
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(check.retryAfter) } }
    )
  }

  try {
    // Require authentication — this endpoint sits behind the auth middleware
    // prefix `/api/domains`, but we still null-check in case middleware config drifts.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = quoteSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { domain, period } = parsed.data
    const priceResult = await opensrs.getDomainPrice(domain, period)
    const total = getCustomerPrice(priceResult.price)

    return NextResponse.json({ domain, period, total })
  } catch (err) {
    console.error('Quote failed', { err })
    return NextResponse.json({ error: 'Quote failed' }, { status: 502 })
  }
}

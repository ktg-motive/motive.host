import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { stripe } from '@/lib/stripe'
import { validateDomain } from '@/lib/domain-validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

const RATE_WINDOW = 60_000
const POST_LIMIT = 5
const DELETE_LIMIT = 10

const domainField = z.string().min(1).superRefine((val, ctx) => {
  const result = validateDomain(val)
  if (!result.valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error })
  }
}).transform((val) => {
  const result = validateDomain(val)
  return result.valid ? result.domain : val
})

const initiateSchema = z.object({
  domain: domainField,
  period: z.number().int().min(1).max(5).default(1),
})

const cancelSchema = z.object({
  paymentIntentId: z.string().min(1),
})

// POST — create a PaymentIntent for the transfer fee and return clientSecret.
// The auth code and contact info are NOT sent here — they come in the confirm step.
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const check = rateLimit(`transfer:initiate:${ip}`, POST_LIMIT, RATE_WINDOW)
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
    const parsed = initiateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { domain, period } = parsed.data

    // Confirm domain isn't already in the account
    const { data: existingDomain } = await supabase
      .from('domains')
      .select('id')
      .eq('customer_id', user.id)
      .eq('domain_name', domain)
      .single()

    if (existingDomain) {
      return NextResponse.json({ error: 'Domain is already in your account' }, { status: 409 })
    }

    // Check for an in-flight transfer for this domain across all customers
    const { data: inFlight } = await supabase
      .from('domains')
      .select('id')
      .eq('domain_name', domain)
      .not('transfer_status', 'is', null)
      .in('transfer_status', ['pending', 'processing', 'approved'])
      .single()

    if (inFlight) {
      return NextResponse.json({ error: 'A transfer is already in progress for this domain' }, { status: 409 })
    }

    // Get authoritative wholesale price (no markup on transfers).
    // getTransferPrice passes period to OpenSRS, which returns the total for that period.
    // Do NOT multiply by period again — that would double-charge.
    const priceResult = await opensrs.getTransferPrice(domain, period)
    const amountCents = Math.round(priceResult.price * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'transfer',
        domain,
        period: String(period),
        user_id: user.id,
      },
    })

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountCents,
    })
  } catch (error) {
    console.error('Transfer initiate error:', error)
    return NextResponse.json({ error: 'Failed to initiate transfer' }, { status: 500 })
  }
}

// DELETE — cancel a PaymentIntent when the user navigates back.
export async function DELETE(request: Request) {
  const ip = getClientIp(request)
  const check = rateLimit(`transfer:cancel:${ip}`, DELETE_LIMIT, RATE_WINDOW)
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
    const parsed = cancelSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { paymentIntentId } = parsed.data
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (paymentIntent.metadata.type !== 'transfer') {
      return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 })
    }

    if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)) {
      await stripe.paymentIntents.cancel(paymentIntentId)
    }

    return NextResponse.json({ cancelled: true })
  } catch (error) {
    console.error('Transfer cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel payment' }, { status: 500 })
  }
}

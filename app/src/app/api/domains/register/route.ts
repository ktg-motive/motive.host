import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { stripe } from '@/lib/stripe'
import { sendRegistrationConfirmation } from '@/lib/sendgrid'
import { getCustomerPrice, priceToCents } from '@/lib/pricing'
import { validateDomain } from '@/lib/domain-validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import type { DomainContact } from '@opensrs/types'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

// Rate limits per IP per minute
const RATE_WINDOW = 60_000
const POST_LIMIT = 10   // PaymentIntent creation
const PATCH_LIMIT = 5   // Test-mode confirm
const PUT_LIMIT = 5     // Fulfillment

function checkRateLimit(request: Request, action: string, limit: number) {
  const ip = getClientIp(request)
  const check = rateLimit(`register:${action}:${ip}`, limit, RATE_WINDOW)
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(check.retryAfter) } }
    )
  }
  return null
}

const contactSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().default('US'),
  org_name: z.string().optional(),
})

const domainField = z.string().min(1).superRefine((val, ctx) => {
  const result = validateDomain(val)
  if (!result.valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error })
  }
}).transform((val) => {
  const result = validateDomain(val)
  return result.valid ? result.domain : val
})

const intentSchema = z.object({
  domain: domainField,
  period: z.number().int().min(1).max(10).default(1),
  contact: contactSchema,
  useForAll: z.boolean().default(true),
  adminContact: contactSchema.optional(),
  techContact: contactSchema.optional(),
  billingContact: contactSchema.optional(),
  privacy: z.boolean().default(true),
  autoRenew: z.boolean().default(false),
})

const confirmSchema = z.object({
  paymentIntentId: z.string().min(1),
  domain: domainField,
  period: z.number().int().min(1).max(10),
  contact: contactSchema,
  useForAll: z.boolean().default(true),
  adminContact: contactSchema.optional(),
  techContact: contactSchema.optional(),
  billingContact: contactSchema.optional(),
  privacy: z.boolean().default(true),
  autoRenew: z.boolean().default(false),
})

// POST creates a PaymentIntent and returns clientSecret.
// PATCH confirms the PaymentIntent server-side (placeholder until Stripe Elements is wired up).
// PUT verifies payment succeeded, then registers the domain.
export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, 'post', POST_LIMIT)
  if (rateLimited) return rateLimited

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = intentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { domain, period } = parsed.data

    // Verify domain is still available
    const availability = await opensrs.checkAvailability(domain)
    if (availability.status !== 'available') {
      return NextResponse.json({ error: 'Domain is no longer available' }, { status: 409 })
    }

    // Get price and create PaymentIntent
    const priceResult = await opensrs.getDomainPrice(domain)
    const customerPrice = getCustomerPrice(priceResult.price)
    const amountCents = priceToCents(customerPrice) * period

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
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
    console.error('PaymentIntent creation error:', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}

// PATCH: server-side payment confirmation (temporary until Stripe Elements is integrated)
const confirmPaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
})

export async function PATCH(request: Request) {
  const rateLimited = checkRateLimit(request, 'patch', PATCH_LIMIT)
  if (rateLimited) return rateLimited

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = confirmPaymentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { paymentIntentId } = parsed.data

    // Verify the PaymentIntent belongs to this user
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (paymentIntent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Confirm the PaymentIntent server-side.
    // TODO: Replace with Stripe Elements confirmPayment() on the client for production.
    // This PATCH endpoint is for development/test mode only and must not be used in live mode.
    if (process.env.OPENSRS_ENVIRONMENT === 'live') {
      return NextResponse.json(
        { error: 'Server-side payment confirmation is disabled in live mode. Use Stripe Elements.' },
        { status: 400 }
      )
    }

    const confirmed = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: 'pm_card_visa',
      return_url: `${request.headers.get('origin') || 'https://domains.motive.host'}/domains`,
    })

    return NextResponse.json({
      status: confirmed.status,
      requiresAction: confirmed.status === 'requires_action',
    })
  } catch (error) {
    console.error('Payment confirmation error:', error)
    return NextResponse.json({ error: 'Payment confirmation failed' }, { status: 500 })
  }
}

// PUT: called after payment confirmation succeeds.
// Uses payment_fulfillments table for idempotency and replay protection.
export async function PUT(request: Request) {
  const rateLimited = checkRateLimit(request, 'put', PUT_LIMIT)
  if (rateLimited) return rateLimited

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = confirmSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { paymentIntentId, domain, period, contact, useForAll, adminContact, techContact, billingContact, privacy, autoRenew } = parsed.data

    // 1. Verify payment was actually completed
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment has not been confirmed' }, { status: 402 })
    }

    if (paymentIntent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (paymentIntent.metadata.domain !== domain) {
      return NextResponse.json({ error: 'Payment domain mismatch' }, { status: 400 })
    }
    if (paymentIntent.metadata.period !== String(period)) {
      return NextResponse.json({ error: 'Payment period mismatch' }, { status: 400 })
    }

    // The PaymentIntent amount is authoritative — set server-side at POST time
    // from a live OpenSRS price + markup. No need to re-fetch; a second lookup
    // creates a race condition if the price changes between intent creation and fulfillment.

    // 2. Check for existing fulfillment (replay protection)
    const { data: existingFulfillment } = await supabase
      .from('payment_fulfillments')
      .select('id, status, opensrs_order_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (existingFulfillment) {
      if (existingFulfillment.status === 'fulfilled') {
        // Already completed — return success idempotently
        return NextResponse.json({
          success: true,
          domain,
          orderId: existingFulfillment.opensrs_order_id,
        })
      }
      if (existingFulfillment.status === 'fulfilled_partial') {
        // OpenSRS succeeded but DB persistence failed — don't mask as success
        return NextResponse.json({
          error: 'Domain was registered but record saving failed. Please contact support.',
          orderId: existingFulfillment.opensrs_order_id,
        }, { status: 500 })
      }
      if (existingFulfillment.status === 'pending') {
        // Another request is in flight — reject to avoid race
        return NextResponse.json({ error: 'Registration is already in progress' }, { status: 409 })
      }
      if (existingFulfillment.status === 'failed_refund_pending') {
        // Registration failed and refund also failed — needs manual intervention
        return NextResponse.json({
          error: 'Registration failed and refund is still being processed. Please contact support.',
        }, { status: 502 })
      }
      // status === 'failed_refunded'
      return NextResponse.json({ error: 'This payment was already refunded due to a prior failure' }, { status: 410 })
    }

    // 3. Claim this fulfillment atomically (unique constraint on stripe_payment_intent_id
    //    prevents concurrent duplicates)
    const { error: claimError } = await supabase
      .from('payment_fulfillments')
      .insert({
        stripe_payment_intent_id: paymentIntentId,
        customer_id: user.id,
        domain_name: domain,
        period,
        amount_cents: paymentIntent.amount,
        status: 'pending',
      })

    if (claimError) {
      // Unique constraint violation means another request beat us
      if (claimError.code === '23505') {
        return NextResponse.json({ error: 'Registration is already in progress' }, { status: 409 })
      }
      console.error('Failed to claim fulfillment:', claimError)
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
    }

    // 4. Build contacts
    const ownerContact: DomainContact = contact
    const contacts = {
      owner: ownerContact,
      admin: useForAll ? ownerContact : (adminContact ?? ownerContact),
      tech: useForAll ? ownerContact : (techContact ?? ownerContact),
      billing: useForAll ? ownerContact : (billingContact ?? ownerContact),
    }

    // 5. Register domain with OpenSRS
    let registrationResult
    try {
      registrationResult = await opensrs.registerDomain({
        domain,
        period,
        contacts,
        autoRenew: autoRenew,
        privacy: privacy,
        handleNow: true,
      })
    } catch (opensrsError) {
      const errorMsg = opensrsError instanceof Error ? opensrsError.message : 'OpenSRS registration failed'
      console.error('OpenSRS registration failed:', opensrsError)

      // Attempt refund first, then update fulfillment with actual outcome
      let refundSucceeded = false
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId })
        refundSucceeded = true
      } catch (refundError) {
        console.error('Refund also failed — manual intervention needed:', refundError)
      }

      await supabase
        .from('payment_fulfillments')
        .update({
          status: refundSucceeded ? 'failed_refunded' : 'failed_refund_pending',
          error_message: errorMsg + (refundSucceeded ? '' : ' — refund also failed, needs manual intervention'),
        })
        .eq('stripe_payment_intent_id', paymentIntentId)

      const userMessage = refundSucceeded
        ? 'Domain registration failed. Payment has been refunded.'
        : 'Domain registration failed. Refund is being processed — please contact support if not received.'
      return NextResponse.json({ error: userMessage }, { status: 502 })
    }

    // 6. Calculate expiration
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + period)

    // 7. Insert domain record — fail hard if this doesn't work
    const { data: domainRecord, error: domainError } = await supabase
      .from('domains')
      .insert({
        customer_id: user.id,
        domain_name: domain,
        registered_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        auto_renew: autoRenew,
        privacy_enabled: privacy,
        status: 'active',
        opensrs_order_id: registrationResult.id,
      })
      .select()
      .single()

    if (domainError || !domainRecord) {
      console.error('Failed to insert domain record:', domainError)
      // Mark as fulfilled_partial — OpenSRS succeeded but DB didn't.
      // Retries will surface this as an error, not false success.
      await supabase
        .from('payment_fulfillments')
        .update({
          status: 'fulfilled_partial',
          opensrs_order_id: registrationResult.id,
          error_message: 'Domain registered at OpenSRS but DB insert failed — needs manual reconciliation',
        })
        .eq('stripe_payment_intent_id', paymentIntentId)

      return NextResponse.json({
        error: 'Domain was registered but we failed to save the record. Please contact support.',
        orderId: registrationResult.id,
      }, { status: 500 })
    }

    // 8. Insert contacts — check result
    const contactTypes = ['registrant', 'admin', 'tech', 'billing'] as const
    const contactData = [ownerContact, contacts.admin, contacts.tech, contacts.billing]

    const { error: contactsError } = await supabase.from('domain_contacts').insert(
      contactTypes.map((type, i) => ({
        domain_id: domainRecord.id,
        contact_type: type,
        ...contactData[i],
      }))
    )

    if (contactsError) {
      console.error('Failed to insert domain contacts:', contactsError)
      // Non-fatal: domain is registered, contacts can be re-synced
    }

    // 9. Insert transaction — check result
    const { error: txError } = await supabase.from('transactions').insert({
      customer_id: user.id,
      domain_id: domainRecord.id,
      type: 'register',
      amount_cents: paymentIntent.amount,
      currency: 'usd',
      stripe_payment_intent_id: paymentIntentId,
      status: 'completed',
    })

    if (txError) {
      console.error('Failed to insert transaction record:', txError)
      // Non-fatal: domain is registered, transaction can be reconciled
    }

    // 10. Mark fulfillment as complete
    const { error: fulfillError } = await supabase
      .from('payment_fulfillments')
      .update({
        status: 'fulfilled',
        opensrs_order_id: registrationResult.id,
      })
      .eq('stripe_payment_intent_id', paymentIntentId)

    if (fulfillError) {
      console.error('Failed to update fulfillment status to fulfilled:', fulfillError)
      // Non-fatal: domain is registered and DB records exist, fulfillment status can be reconciled
    }

    // 11. Send confirmation email (non-blocking)
    if (user.email) {
      try {
        await sendRegistrationConfirmation(user.email, domain, expiresAt.toISOString())
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError)
      }
    }

    return NextResponse.json({
      success: true,
      domain,
      orderId: registrationResult.id,
    })
  } catch (error) {
    console.error('Registration confirmation error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

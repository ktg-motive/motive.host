import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { stripe } from '@/lib/stripe'
import { sendRegistrationConfirmation } from '@/lib/sendgrid'
import { getCustomerPrice, priceToCents } from '@/lib/pricing'
import type { DomainContact } from '@opensrs/types'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

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

const intentSchema = z.object({
  domain: z.string().min(1),
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
  domain: z.string().min(1),
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

// PUT: called after payment confirmation succeeds
export async function PUT(request: Request) {
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

    // Verify the PaymentIntent belongs to this user
    if (paymentIntent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify the PaymentIntent matches the requested domain and period
    if (paymentIntent.metadata.domain !== domain) {
      return NextResponse.json({ error: 'Payment domain mismatch' }, { status: 400 })
    }
    if (paymentIntent.metadata.period !== String(period)) {
      return NextResponse.json({ error: 'Payment period mismatch' }, { status: 400 })
    }

    // Verify the amount matches server-calculated pricing
    const priceResult = await opensrs.getDomainPrice(domain)
    const customerPrice = getCustomerPrice(priceResult.price)
    const expectedAmountCents = priceToCents(customerPrice) * period
    if (paymentIntent.amount !== expectedAmountCents) {
      return NextResponse.json({ error: 'Payment amount mismatch' }, { status: 400 })
    }

    // 2. Build contacts
    const ownerContact: DomainContact = contact
    const contacts = {
      owner: ownerContact,
      admin: useForAll ? ownerContact : (adminContact ?? ownerContact),
      tech: useForAll ? ownerContact : (techContact ?? ownerContact),
      billing: useForAll ? ownerContact : (billingContact ?? ownerContact),
    }

    // 3. Register domain with OpenSRS
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
      // Refund the payment since OpenSRS registration failed
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId })
      } catch (refundError) {
        console.error('Refund also failed — manual intervention needed:', refundError)
      }
      console.error('OpenSRS registration failed:', opensrsError)
      return NextResponse.json({ error: 'Domain registration failed. Payment has been refunded.' }, { status: 502 })
    }

    // 4. Calculate expiration
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + period)

    // 5. Insert domain record — fail hard if this doesn't work
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
      return NextResponse.json({
        error: 'Domain was registered but we failed to save the record. Please contact support.',
        orderId: registrationResult.id,
      }, { status: 500 })
    }

    // 6. Insert contacts
    const contactTypes = ['registrant', 'admin', 'tech', 'billing'] as const
    const contactData = [ownerContact, contacts.admin, contacts.tech, contacts.billing]

    await supabase.from('domain_contacts').insert(
      contactTypes.map((type, i) => ({
        domain_id: domainRecord.id,
        contact_type: type,
        ...contactData[i],
      }))
    )

    // 7. Insert transaction
    await supabase.from('transactions').insert({
      customer_id: user.id,
      domain_id: domainRecord.id,
      type: 'register',
      amount_cents: paymentIntent.amount,
      currency: 'usd',
      stripe_payment_intent_id: paymentIntentId,
      status: 'completed',
    })

    // 8. Send confirmation email (non-blocking)
    try {
      await sendRegistrationConfirmation(user.email!, domain, expiresAt.toISOString())
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError)
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

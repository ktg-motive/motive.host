import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { stripe } from '@/lib/stripe'
import { validateDomain } from '@/lib/domain-validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import type { DomainContact } from '@opensrs/types'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

const RATE_WINDOW = 60_000
const CONFIRM_LIMIT = 5

const domainField = z.string().min(1).superRefine((val, ctx) => {
  const result = validateDomain(val)
  if (!result.valid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error })
  }
}).transform((val) => {
  const result = validateDomain(val)
  return result.valid ? result.domain : val
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

const confirmSchema = z.object({
  paymentIntentId: z.string().min(1),
  domain: domainField,
  period: z.number().int().min(1).max(5),
  // auth_code is intentionally NOT stored in DB — it's used in-flight only
  auth_code: z.string().min(1).max(255),
  contact: contactSchema,
  useForAll: z.boolean().default(true),
  adminContact: contactSchema.optional(),
  techContact: contactSchema.optional(),
  billingContact: contactSchema.optional(),
  privacy: z.boolean().default(true),
  autoRenew: z.boolean().default(false),
})

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const check = rateLimit(`transfer:confirm:${ip}`, CONFIRM_LIMIT, RATE_WINDOW)
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
    const parsed = confirmSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const {
      paymentIntentId,
      domain,
      period,
      auth_code,
      contact,
      useForAll,
      adminContact,
      techContact,
      billingContact,
      privacy,
      autoRenew,
    } = parsed.data

    // 1. Verify payment succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment has not been confirmed' }, { status: 402 })
    }

    if (paymentIntent.metadata.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (paymentIntent.metadata.type !== 'transfer') {
      return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 })
    }

    if (paymentIntent.metadata.domain !== domain) {
      return NextResponse.json({ error: 'Payment domain mismatch' }, { status: 400 })
    }

    if (paymentIntent.metadata.period !== String(period)) {
      return NextResponse.json({ error: 'Payment period mismatch' }, { status: 400 })
    }

    // 2. Check for existing fulfillment (replay protection)
    const { data: existingFulfillment } = await supabase
      .from('payment_fulfillments')
      .select('id, status, opensrs_order_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (existingFulfillment) {
      if (existingFulfillment.status === 'fulfilled') {
        return NextResponse.json({
          success: true,
          domain,
          orderId: existingFulfillment.opensrs_order_id,
        })
      }
      if (existingFulfillment.status === 'fulfilled_partial') {
        return NextResponse.json({
          error: 'Transfer was initiated but record saving failed. Please contact support.',
          orderId: existingFulfillment.opensrs_order_id,
        }, { status: 500 })
      }
      if (existingFulfillment.status === 'pending') {
        return NextResponse.json({ error: 'Transfer is already in progress' }, { status: 409 })
      }
      if (existingFulfillment.status === 'failed_refund_pending') {
        return NextResponse.json({
          error: 'Transfer failed and refund is being processed. Please contact support.',
        }, { status: 502 })
      }
      return NextResponse.json({ error: 'This payment was already refunded due to a prior failure' }, { status: 410 })
    }

    // 3. Claim this fulfillment atomically
    const { error: claimError } = await supabase
      .from('payment_fulfillments')
      .insert({
        stripe_payment_intent_id: paymentIntentId,
        customer_id: user.id,
        domain_name: domain,
        period,
        amount_cents: paymentIntent.amount,
        type: 'transfer',
        status: 'pending',
      })

    if (claimError) {
      if (claimError.code === '23505') {
        return NextResponse.json({ error: 'Transfer is already in progress' }, { status: 409 })
      }
      console.error('Failed to claim fulfillment:', claimError)
      return NextResponse.json({ error: 'Transfer initiation failed' }, { status: 500 })
    }

    // 4. Build contacts
    const ownerContact: DomainContact = contact
    const contacts = {
      owner: ownerContact,
      admin: useForAll ? ownerContact : (adminContact ?? ownerContact),
      tech: useForAll ? ownerContact : (techContact ?? ownerContact),
      billing: useForAll ? ownerContact : (billingContact ?? ownerContact),
    }

    // 5. Initiate transfer at OpenSRS (auth_code is used here only — never persisted)
    let transferResult
    let transferOrderId: string
    try {
      transferResult = await opensrs.processTransfer({
        domain,
        authInfo: auth_code,
        period,
        contacts,
        autoRenew,
        privacy,
      })
      // OpenSRS may surface the order ID as `id` or `transfer_order_id` depending on TLD/async handling
      transferOrderId = transferResult.id || transferResult.transfer_order_id || ''
      if (!transferOrderId) {
        console.error('PROCESS_TRANSFER returned no order ID — response:', transferResult)
      }
    } catch (opensrsError) {
      const errorMsg = opensrsError instanceof Error ? opensrsError.message : 'OpenSRS transfer failed'
      console.error('OpenSRS processTransfer failed:', opensrsError)

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
        ? 'Transfer could not be initiated. Payment has been refunded.'
        : 'Transfer could not be initiated. Refund is being processed — contact support if not received.'
      return NextResponse.json({ error: userMessage }, { status: 502 })
    }

    // 6. Create domain record in transferring state
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + period)

    const { data: domainRecord, error: domainError } = await supabase
      .from('domains')
      .insert({
        customer_id: user.id,
        domain_name: domain,
        status: 'transferring',
        auto_renew: autoRenew,
        privacy_enabled: privacy,
        transfer_order_id: transferOrderId,
        transfer_status: 'pending',
        transfer_initiated_at: new Date().toISOString(),
        // expires_at will be set when transfer completes
      })
      .select()
      .single()

    if (domainError || !domainRecord) {
      console.error('Failed to insert domain record:', domainError)
      await supabase
        .from('payment_fulfillments')
        .update({
          status: 'fulfilled_partial',
          opensrs_order_id: transferOrderId,
          error_message: 'Transfer initiated at OpenSRS but DB insert failed — needs manual reconciliation',
        })
        .eq('stripe_payment_intent_id', paymentIntentId)

      return NextResponse.json({
        error: 'Transfer was initiated but we failed to save the record. Please contact support.',
        orderId: transferOrderId,
      }, { status: 500 })
    }

    // 7. Insert contacts
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
    }

    // 8. Insert transaction
    const { error: txError } = await supabase.from('transactions').insert({
      customer_id: user.id,
      domain_id: domainRecord.id,
      type: 'transfer',
      amount_cents: paymentIntent.amount,
      currency: 'usd',
      stripe_payment_intent_id: paymentIntentId,
      status: 'completed',
    })
    if (txError) {
      console.error('Failed to insert transaction record:', txError)
    }

    // 9. Mark fulfillment complete
    await supabase
      .from('payment_fulfillments')
      .update({
        status: 'fulfilled',
        opensrs_order_id: transferOrderId,
      })
      .eq('stripe_payment_intent_id', paymentIntentId)

    return NextResponse.json({
      success: true,
      domain,
      orderId: transferOrderId,
      message: 'Transfer initiated. This typically takes 5–7 days. You can check status in your Domains dashboard.',
    })
  } catch (error) {
    console.error('Transfer confirm error:', error)
    return NextResponse.json({ error: 'Transfer confirmation failed' }, { status: 500 })
  }
}

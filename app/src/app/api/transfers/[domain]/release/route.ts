import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOpenSRSClient } from '@opensrs'
import { validateDomain } from '@/lib/domain-validation'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

interface RouteParams {
  params: Promise<{ domain: string }>
}

// POST — outbound transfer: unlock domain + send EPP/auth code to registrant email.
// No payment required; OpenSRS emails the auth code to the registrant's address on file.
export async function POST(request: Request, { params }: RouteParams) {
  const ip = getClientIp(request)
  const check = rateLimit(`transfer:release:${ip}`, 3, 60_000)
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

    const { domain: rawDomain } = await params
    const domain = decodeURIComponent(rawDomain)

    const validation = validateDomain(domain)
    if (!validation.valid) {
      return NextResponse.json({ error: 'Invalid domain name' }, { status: 400 })
    }

    // Verify ownership and domain is active
    const { data: domainRecord } = await supabase
      .from('domains')
      .select('id, domain_name, status')
      .eq('customer_id', user.id)
      .eq('domain_name', validation.domain)
      .single()

    if (!domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    if (domainRecord.status !== 'active') {
      return NextResponse.json(
        { error: `Domain must be active to initiate an outbound transfer (current status: ${domainRecord.status})` },
        { status: 409 }
      )
    }

    // Get registrant email from domain_contacts so we can tell the user where to look
    const { data: registrantContact } = await supabase
      .from('domain_contacts')
      .select('email')
      .eq('domain_id', domainRecord.id)
      .eq('contact_type', 'registrant')
      .single()

    // Unlock the domain at OpenSRS, then send the auth code.
    // If sendAuthCode fails after the unlock, attempt to re-lock to leave the domain in a safe state.
    await opensrs.unlockDomain(domainRecord.domain_name)

    try {
      await opensrs.sendAuthCode(domainRecord.domain_name)
    } catch (authCodeError) {
      console.error('sendAuthCode failed after unlock — attempting re-lock:', authCodeError)
      try {
        await opensrs.lockDomain(domainRecord.domain_name)
      } catch (relockError) {
        console.error('Re-lock also failed — domain may be left unlocked, manual intervention required:', relockError)
      }
      return NextResponse.json(
        { error: 'Domain was unlocked but auth code delivery failed. Your domain has been re-locked. Please contact support.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      domain: domainRecord.domain_name,
      registrant_email: registrantContact?.email ?? null,
      message: 'Domain unlocked and authorization code sent to registrant email. Use the code to initiate the transfer at your new registrar.',
    })
  } catch (error) {
    console.error('Transfer release error:', error)
    return NextResponse.json({ error: 'Failed to initiate outbound transfer. Please contact support.' }, { status: 500 })
  }
}

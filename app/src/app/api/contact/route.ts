import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendContactForm } from '@/lib/sendgrid'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

// Allowed origins → recipient mapping
// Add new hosted sites here as they need contact forms
const SITE_CONFIG: Record<string, { to: string; fromEmail: string; fromName: string; siteName: string }> = {
  'aiwithkai.com': {
    to: 'kaigray@la-ai.io',
    fromEmail: 'hello@aiwithkai.com',
    fromName: 'AI with Kai',
    siteName: 'aiwithkai.com',
  },
  'www.aiwithkai.com': {
    to: 'kaigray@la-ai.io',
    fromEmail: 'hello@aiwithkai.com',
    fromName: 'AI with Kai',
    siteName: 'aiwithkai.com',
  },
}

// Also allow localhost for development
const DEV_ORIGINS = ['localhost', '127.0.0.1']

const bodySchema = z.object({
  type: z.enum(['guest', 'sponsor']),
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(320),
  // Guest-specific
  topic: z.string().max(2000).optional(),
  ai_usage: z.string().max(2000).optional(),
  // Sponsor-specific
  website: z.string().url().max(500).optional().or(z.literal('')),
  interest: z.string().max(2000).optional(),
  budget: z.string().max(100).optional(),
})

function getSiteConfig(origin: string | null) {
  if (!origin) return null

  // Dev mode: allow localhost origins, route to first config
  try {
    const host = new URL(origin).hostname
    if (DEV_ORIGINS.includes(host)) {
      return Object.values(SITE_CONFIG)[0] || null
    }
    return SITE_CONFIG[host] || null
  } catch {
    return null
  }
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') || ''
  const config = getSiteConfig(origin)
  if (!config) {
    return new NextResponse(null, { status: 403 })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin') || ''
  const config = getSiteConfig(origin)

  if (!config) {
    return NextResponse.json(
      { error: 'Origin not allowed' },
      { status: 403 }
    )
  }

  const headers = corsHeaders(origin)

  // Rate limit: 5 submissions per IP per minute
  const ip = getClientIp(request)
  const check = rateLimit(`contact:${ip}`, 5, 60_000)
  if (!check.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again shortly.' },
      { status: 429, headers: { ...headers, 'Retry-After': String(check.retryAfter) } }
    )
  }

  let body: z.infer<typeof bodySchema>
  try {
    const raw = await request.json()
    body = bodySchema.parse(raw)
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400, headers }
    )
  }

  const isGuest = body.type === 'guest'

  const subject = isGuest
    ? `Guest Inquiry from ${body.name}`
    : `Sponsorship Inquiry from ${body.company}`

  const fields: Record<string, string> = {
    Name: body.name,
    Company: body.company,
    Email: body.email,
  }

  if (isGuest) {
    if (body.topic) fields['Topic'] = body.topic
    if (body.ai_usage) fields['Current AI Usage'] = body.ai_usage
  } else {
    if (body.website) fields['Website'] = body.website
    if (body.interest) fields['Interest'] = body.interest
    if (body.budget) fields['Budget'] = body.budget
  }

  try {
    await sendContactForm({
      to: config.to,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyTo: body.email,
      subject,
      fields,
      siteName: config.siteName,
    })
  } catch (err) {
    console.error('SendGrid contact form error:', err)
    return NextResponse.json(
      { error: 'Failed to send message. Please try again.' },
      { status: 500, headers }
    )
  }

  return NextResponse.json({ ok: true }, { headers })
}

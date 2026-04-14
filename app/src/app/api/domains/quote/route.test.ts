import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

beforeAll(() => {
  process.env.OPENSRS_API_KEY = 'test-key'
  process.env.OPENSRS_RESELLER_USERNAME = 'test-user'
  process.env.OPENSRS_ENVIRONMENT = 'test'
})

const checkAvailability = vi.fn()
const suggestDomains = vi.fn()
const getDomainPrice = vi.fn()
const getUser = vi.fn()

vi.mock('@opensrs', () => ({
  createOpenSRSClient: () => ({
    checkAvailability,
    suggestDomains,
    getDomainPrice,
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}))

async function callPost(body: unknown) {
  const { POST } = await import('./route')
  const req = new Request('http://localhost/api/domains/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // ignore
  }
  return { res, json: json as Record<string, unknown> }
}

describe('POST /api/domains/quote', () => {
  beforeEach(() => {
    getDomainPrice.mockReset()
    getUser.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'user-123', email: 'a@b.com' } } })
  })

  it('returns total for valid .ai @ 2 years', async () => {
    getDomainPrice.mockResolvedValue({ price: 100 })
    const { res, json } = await callPost({ domain: 'usemotive.ai', period: 2 })
    expect(res.status).toBe(200)
    expect(json.domain).toBe('usemotive.ai')
    expect(json.period).toBe(2)
    expect(typeof json.total).toBe('number')
    expect(getDomainPrice).toHaveBeenCalledWith('usemotive.ai', 2)
  })

  it('rejects .ai @ 1 year with 400 and period-path error', async () => {
    const { res, json } = await callPost({ domain: 'usemotive.ai', period: 1 })
    expect(res.status).toBe(400)
    const details = json.details as {
      fieldErrors?: Record<string, string[]>
      formErrors?: string[]
    } | undefined
    // Zod reports refinement errors under `formErrors` for refinements applied
    // to the root object, or under fieldErrors.period depending on zod version.
    const hasPeriodError =
      !!details?.fieldErrors?.period?.length || !!details?.formErrors?.length
    expect(hasPeriodError).toBe(true)
  })

  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { res } = await callPost({ domain: 'usemotive.com', period: 1 })
    expect(res.status).toBe(401)
  })

  it('returns 502 when OpenSRS throws', async () => {
    getDomainPrice.mockRejectedValue(new Error('OpenSRS down'))
    const { res } = await callPost({ domain: 'usemotive.com', period: 1 })
    expect(res.status).toBe(502)
  })
})

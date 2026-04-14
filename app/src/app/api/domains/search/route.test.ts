import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

beforeAll(() => {
  process.env.OPENSRS_API_KEY = 'test-key'
  process.env.OPENSRS_RESELLER_USERNAME = 'test-user'
  process.env.OPENSRS_ENVIRONMENT = 'test'
})

// Stubbed methods shared across tests — reset per-test.
const checkAvailability = vi.fn()
const suggestDomains = vi.fn()
const getDomainPrice = vi.fn()

vi.mock('@opensrs', () => ({
  createOpenSRSClient: () => ({
    checkAvailability,
    suggestDomains,
    getDomainPrice,
  }),
}))

// Disable rate limiting by making it always allow.
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '127.0.0.1',
}))

async function callPost(body: unknown) {
  const { POST } = await import('./route')
  const req = new Request('http://localhost/api/domains/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  return { res, json: await res.json() }
}

describe('POST /api/domains/search — TLD-aware pricing', () => {
  beforeEach(() => {
    checkAvailability.mockReset()
    suggestDomains.mockReset()
    getDomainPrice.mockReset()
    suggestDomains.mockResolvedValue([])
  })

  it('uses period=2 for .ai and returns minPeriod=2 with periodNote', async () => {
    checkAvailability.mockResolvedValue({ domain: 'usemotive.ai', status: 'available' })
    getDomainPrice.mockResolvedValue({ price: 100 })

    const { res, json } = await callPost({ query: 'usemotive.ai' })

    expect(res.status).toBe(200)
    expect(getDomainPrice).toHaveBeenCalledWith('usemotive.ai', 2)
    expect(json.exact.minPeriod).toBe(2)
    expect(json.exact.periodNote).toBeTruthy()
    expect(typeof json.exact.price).toBe('number')
    expect(json.exact.priceError).toBeUndefined()
  })

  it('uses period=1 for .com and omits periodNote', async () => {
    checkAvailability.mockResolvedValue({ domain: 'usemotive.com', status: 'available' })
    getDomainPrice.mockResolvedValue({ price: 10 })

    const { res, json } = await callPost({ query: 'usemotive.com' })

    expect(res.status).toBe(200)
    expect(getDomainPrice).toHaveBeenCalledWith('usemotive.com', 1)
    expect(json.exact.minPeriod).toBe(1)
    expect(json.exact.periodNote).toBeUndefined()
    expect(typeof json.exact.price).toBe('number')
  })

  it('returns priceError when getDomainPrice throws for .ai', async () => {
    checkAvailability.mockResolvedValue({ domain: 'usemotive.ai', status: 'available' })
    getDomainPrice.mockRejectedValue(new Error('OpenSRS rejected period'))

    const { res, json } = await callPost({ query: 'usemotive.ai' })

    expect(res.status).toBe(200)
    expect(json.exact.price).toBeUndefined()
    expect(typeof json.exact.priceError).toBe('string')
    expect(json.exact.minPeriod).toBe(2)
  })

  it('each suggestion carries its own minPeriod', async () => {
    checkAvailability.mockResolvedValue({ domain: 'usemotive.com', status: 'available' })
    suggestDomains.mockResolvedValue([
      { domain: 'usemotive.ai', status: 'available' },
      { domain: 'usemotive.net', status: 'available' },
    ])
    getDomainPrice.mockImplementation(async (d: string, period: number) => {
      return { price: d.endsWith('.ai') ? 100 * period : 10 * period }
    })

    const { res, json } = await callPost({ query: 'usemotive.com' })

    expect(res.status).toBe(200)
    const aiSug = json.suggestions.find((s: { domain: string }) => s.domain === 'usemotive.ai')
    const netSug = json.suggestions.find((s: { domain: string }) => s.domain === 'usemotive.net')
    expect(aiSug.minPeriod).toBe(2)
    expect(netSug.minPeriod).toBe(1)
    expect(getDomainPrice).toHaveBeenCalledWith('usemotive.ai', 2)
    expect(getDomainPrice).toHaveBeenCalledWith('usemotive.net', 1)
  })
})

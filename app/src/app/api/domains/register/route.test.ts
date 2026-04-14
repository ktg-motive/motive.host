import { describe, it, expect, vi, beforeAll } from 'vitest'

// Stub env vars before any module-scope constructors run.
beforeAll(() => {
  process.env.OPENSRS_API_KEY = 'test-key'
  process.env.OPENSRS_RESELLER_USERNAME = 'test-user'
  process.env.OPENSRS_ENVIRONMENT = 'test'
  process.env.STRIPE_SECRET_KEY = 'sk_test_123'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

// Mock module-scope dependencies that would otherwise hit network/env.
vi.mock('@opensrs', () => ({
  createOpenSRSClient: () => ({
    checkAvailability: vi.fn(),
    suggestDomains: vi.fn(),
    getDomainPrice: vi.fn(),
    registerDomain: vi.fn(),
    getRegistrationStatus: vi.fn(),
  }),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
      cancel: vi.fn(),
    },
    refunds: { create: vi.fn() },
  },
}))

vi.mock('@/lib/sendgrid', () => ({
  sendRegistrationConfirmation: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

const validContact = {
  first_name: 'Kai',
  last_name: 'Gray',
  email: 'kai@example.com',
  phone: '+1.5551234567',
  address1: '123 Main St',
  city: 'Mobile',
  state: 'AL',
  postal_code: '36602',
  country: 'US',
}

describe('intentSchema period refinement', () => {
  it('rejects period=1 for .ai', async () => {
    const { intentSchema } = await import('./route')
    const result = intentSchema.safeParse({
      domain: 'foo.ai',
      period: 1,
      contact: validContact,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors
      expect(errs.period).toBeDefined()
    }
  })

  it('accepts period=2 for .ai', async () => {
    const { intentSchema } = await import('./route')
    const result = intentSchema.safeParse({
      domain: 'foo.ai',
      period: 2,
      contact: validContact,
    })
    expect(result.success).toBe(true)
  })

  it('accepts period=1 for .com', async () => {
    const { intentSchema } = await import('./route')
    const result = intentSchema.safeParse({
      domain: 'foo.com',
      period: 1,
      contact: validContact,
    })
    expect(result.success).toBe(true)
  })

  it('rejects period=11 (exceeds z.max(10))', async () => {
    const { intentSchema } = await import('./route')
    const result = intentSchema.safeParse({
      domain: 'foo.ai',
      period: 11,
      contact: validContact,
    })
    expect(result.success).toBe(false)
  })
})

describe('confirmSchema period refinement', () => {
  it('rejects period=1 for .ai', async () => {
    const { confirmSchema } = await import('./route')
    const result = confirmSchema.safeParse({
      paymentIntentId: 'pi_123',
      domain: 'foo.ai',
      period: 1,
      contact: validContact,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errs = result.error.flatten().fieldErrors
      expect(errs.period).toBeDefined()
    }
  })

  it('accepts period=2 for .ai', async () => {
    const { confirmSchema } = await import('./route')
    const result = confirmSchema.safeParse({
      paymentIntentId: 'pi_123',
      domain: 'foo.ai',
      period: 2,
      contact: validContact,
    })
    expect(result.success).toBe(true)
  })

  it('accepts period=1 for .com', async () => {
    const { confirmSchema } = await import('./route')
    const result = confirmSchema.safeParse({
      paymentIntentId: 'pi_123',
      domain: 'foo.com',
      period: 1,
      contact: validContact,
    })
    expect(result.success).toBe(true)
  })

  it('rejects period=11 (exceeds z.max(10))', async () => {
    const { confirmSchema } = await import('./route')
    const result = confirmSchema.safeParse({
      paymentIntentId: 'pi_123',
      domain: 'foo.ai',
      period: 11,
      contact: validContact,
    })
    expect(result.success).toBe(false)
  })
})

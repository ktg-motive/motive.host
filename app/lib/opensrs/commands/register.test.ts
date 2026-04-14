import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRegisterCommands, generateRegistrantPassword } from './register'
import type { OpenSRSClient } from '../client'
import type { DomainContact, RegisterDomainParams, XCPRequest, OpenSRSResponse } from '../types'

// Minimal stub of OpenSRSClient — we only need .request(). Cast through unknown
// so we can control request behavior per-test without instantiating the real
// class (which would try to read env config).
function makeStubClient(handler: (req: XCPRequest) => Promise<OpenSRSResponse>) {
  return { request: vi.fn(handler) } as unknown as OpenSRSClient
}

const ownerContact: DomainContact = {
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

const baseParams: RegisterDomainParams = {
  domain: 'usemotive.ai',
  period: 2,
  contacts: {
    owner: ownerContact,
    admin: ownerContact,
    tech: ownerContact,
    billing: ownerContact,
  },
  handleNow: true,
}

// Build a handler that returns SW_REGISTER success with the given order id
// and GET_ORDER_INFO with the given status. Tracks every request in `calls`.
function makeHandler({
  orderId = '12345',
  orderStatus = 'completed',
  infoThrows = false,
}: { orderId?: string; orderStatus?: string; infoThrows?: boolean } = {}) {
  const calls: XCPRequest[] = []
  const handler = vi.fn(async (req: XCPRequest): Promise<OpenSRSResponse> => {
    calls.push(req)
    if (req.action === 'SW_REGISTER') {
      return {
        isSuccess: true,
        responseCode: 200,
        responseText: 'Registration successful',
        attributes: {
          id: orderId,
          registration_text: 'ok',
          registration_code: '200',
        },
      }
    }
    if (req.action === 'GET_ORDER_INFO') {
      if (infoThrows) throw new Error('order info unavailable')
      return {
        isSuccess: true,
        responseCode: 200,
        responseText: 'Query successful',
        attributes: {
          id: orderId,
          domain: baseParams.domain,
          status: orderStatus,
        },
      }
    }
    throw new Error(`Unexpected action: ${req.action}`)
  })
  return { handler, calls }
}

describe('generateRegistrantPassword', () => {
  it('returns a 16-character alphanumeric string by default', () => {
    const pw = generateRegistrantPassword()
    expect(pw).toHaveLength(16)
    expect(pw).toMatch(/^[A-Za-z0-9]{16}$/)
  })

  it('honors a custom length', () => {
    expect(generateRegistrantPassword(20)).toHaveLength(20)
    expect(generateRegistrantPassword(8)).toHaveLength(8)
  })

  it('contains no hyphens or punctuation', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateRegistrantPassword(16)
      expect(pw).not.toMatch(/[-_./\\:;,]/)
    }
  })

  it('produces distinct values across calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) seen.add(generateRegistrantPassword(16))
    // With 62^16 space, 20 calls should produce 20 unique values.
    expect(seen.size).toBe(20)
  })
})

describe('registerDomain — attribute defaults', () => {
  let spy: ReturnType<typeof makeHandler>

  beforeEach(() => {
    spy = makeHandler({ orderStatus: 'completed' })
  })

  it('sets custom_nameservers="0" when no custom nameservers are provided', async () => {
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)
    await register.registerDomain(baseParams)

    const swRegister = spy.calls.find((c) => c.action === 'SW_REGISTER')
    expect(swRegister).toBeDefined()
    expect(swRegister!.attributes.custom_nameservers).toBe('0')
    // nameserver_set must not be present when we defer to the reseller default
    expect(swRegister!.attributes.nameserver_set).toBeUndefined()
  })

  it('sets custom_nameservers="1" and populates nameserver_set when custom NS are provided', async () => {
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)
    await register.registerDomain({
      ...baseParams,
      customNameservers: ['ns1.example.com', 'ns2.example.com'],
    })

    const swRegister = spy.calls.find((c) => c.action === 'SW_REGISTER')!
    expect(swRegister.attributes.custom_nameservers).toBe('1')
    const nsSet = swRegister.attributes.nameserver_set as Record<string, { name: string; sortorder: string }>
    expect(nsSet).toBeDefined()
    expect(nsSet.name1).toEqual({ name: 'ns1.example.com', sortorder: '1' })
    expect(nsSet.name2).toEqual({ name: 'ns2.example.com', sortorder: '2' })
  })

  it('sets custom_tech_contact="1" so our submitted tech contact is used', async () => {
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)
    await register.registerDomain(baseParams)

    const swRegister = spy.calls.find((c) => c.action === 'SW_REGISTER')!
    expect(swRegister.attributes.custom_tech_contact).toBe('1')
  })

  it('emits reg_password as a 16-char alphanumeric string at the top level of attributes', async () => {
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)
    await register.registerDomain(baseParams)

    const swRegister = spy.calls.find((c) => c.action === 'SW_REGISTER')!
    const pw = swRegister.attributes.reg_password
    expect(typeof pw).toBe('string')
    expect(pw as string).toMatch(/^[A-Za-z0-9]{16}$/)
  })
})

describe('registerDomain — order status verification', () => {
  it('calls GET_ORDER_INFO after SW_REGISTER and returns verified_status on success', async () => {
    const spy = makeHandler({ orderId: '99999', orderStatus: 'completed' })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    const result = await register.registerDomain(baseParams)

    const actions = spy.calls.map((c) => c.action)
    expect(actions).toContain('SW_REGISTER')
    expect(actions).toContain('GET_ORDER_INFO')

    const infoCall = spy.calls.find((c) => c.action === 'GET_ORDER_INFO')!
    expect(infoCall.attributes.order_id).toBe('99999')

    expect(result.id).toBe('99999')
    expect(result.verified_status).toBe('completed')
  })

  it('throws when order status is not a terminal success state (e.g. pending)', async () => {
    const spy = makeHandler({ orderId: '383680739', orderStatus: 'pending' })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    await expect(register.registerDomain(baseParams)).rejects.toThrow(
      /did not reach a terminal success state/
    )
  })

  it('throws when order status is "declined"', async () => {
    const spy = makeHandler({ orderStatus: 'declined' })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    await expect(register.registerDomain(baseParams)).rejects.toThrow(/declined/)
  })

  it('fails fast on terminal failure status without burning retries', async () => {
    const spy = makeHandler({ orderStatus: 'cancelled' })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    await expect(register.registerDomain(baseParams)).rejects.toThrow(/terminal failure state: cancelled/)
    // Exactly one GET_ORDER_INFO call — no retries on a known-terminal failure.
    const infoCalls = spy.calls.filter((c) => c.action === 'GET_ORDER_INFO')
    expect(infoCalls).toHaveLength(1)
  })

  it('throws when GET_ORDER_INFO keeps failing', async () => {
    const spy = makeHandler({ infoThrows: true })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    await expect(register.registerDomain(baseParams)).rejects.toThrow(
      /status lookup error: order info unavailable/
    )
  })

  it('accepts "processed" as a terminal success state', async () => {
    const spy = makeHandler({ orderStatus: 'processed' })
    const client = makeStubClient(spy.handler)
    const register = createRegisterCommands(client)

    const result = await register.registerDomain(baseParams)
    expect(result.verified_status).toBe('processed')
  })
})

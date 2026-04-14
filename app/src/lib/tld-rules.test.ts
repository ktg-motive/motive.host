import { describe, it, expect, afterEach } from 'vitest'
import { getTldRules, getTld, __setTldRuleForTest } from './tld-rules'

describe('getTldRules', () => {
  it('returns default rules for unknown TLDs', () => {
    const r = getTldRules('foo.com')
    expect(r.minPeriod).toBe(1)
    expect(r.maxPeriod).toBe(10)
    expect(r.note).toBeUndefined()
  })

  it('returns .ai rules for .ai domains', () => {
    const r = getTldRules('foo.ai')
    expect(r.minPeriod).toBe(2)
    expect(r.maxPeriod).toBe(10)
    expect(typeof r.note).toBe('string')
    expect(r.note).toMatch(/2-year/)
  })

  it('is case-insensitive', () => {
    const r = getTldRules('FOO.AI')
    expect(r.minPeriod).toBe(2)
  })

  it('handles deeper subdomains on .ai', () => {
    const r = getTldRules('shop.store.foo.ai')
    expect(r.minPeriod).toBe(2)
  })
})

describe('getTld', () => {
  it('returns the TLD suffix when matched', () => {
    expect(getTld('foo.ai')).toBe('.ai')
  })

  it('returns the bare TLD when no rule matches', () => {
    expect(getTld('foo.com')).toBe('.com')
  })

  it('returns empty string when no dot is present', () => {
    expect(getTld('foo')).toBe('')
  })

  it('is case-insensitive', () => {
    expect(getTld('FOO.AI')).toBe('.ai')
  })
})

describe('longest-suffix precedence', () => {
  let restore: (() => void) | null = null

  afterEach(() => {
    if (restore) {
      restore()
      restore = null
    }
  })

  it('resolves .co.uk over .uk when both rules exist', () => {
    const restoreUk = __setTldRuleForTest('.uk', { minPeriod: 1, maxPeriod: 10, note: 'uk' })
    const restoreCoUk = __setTldRuleForTest('.co.uk', {
      minPeriod: 2,
      maxPeriod: 9,
      note: 'co.uk',
    })
    try {
      const r = getTldRules('foo.co.uk')
      expect(r.minPeriod).toBe(2)
      expect(r.maxPeriod).toBe(9)
      expect(r.note).toBe('co.uk')
      expect(getTld('foo.co.uk')).toBe('.co.uk')
    } finally {
      restoreCoUk()
      restoreUk()
    }
  })
})

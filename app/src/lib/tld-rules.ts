// Per-TLD registration rules. Hand-curated; extend as we discover more quirks.
// OpenSRS rejects GET_PRICE / SW_REGISTER with period < minPeriod for these.

export interface TldRules {
  minPeriod: number // smallest legal registration period, in years
  maxPeriod: number // largest legal registration period, in years
  note?: string // user-facing explanation when minPeriod > 1
}

export const DEFAULT_RULES: TldRules = { minPeriod: 1, maxPeriod: 10 }

// Only list TLDs that deviate from the default. Keys are matched as suffixes
// against the full domain, longest-first — this lets ".co.uk" beat ".uk".
const TLD_RULES: Record<string, TldRules> = {
  '.ai': {
    minPeriod: 2,
    maxPeriod: 10,
    note: '.ai domains require a 2-year minimum registration.',
  },
  // Future entries (verified before adding):
  // '.tm':    { minPeriod: 10, maxPeriod: 10, note: '.tm domains require a 10-year registration.' },
  // '.co.uk': { minPeriod: 1, maxPeriod: 10 },
}

// Sorted once at module load, longest suffix first. Keeps lookup O(n) but with
// n very small in practice.
const SORTED_KEYS = Object.keys(TLD_RULES).sort((a, b) => b.length - a.length)

/** Returns the rules for a TLD, falling back to the defaults. */
export function getTldRules(domain: string): TldRules {
  const lower = domain.toLowerCase()
  for (const key of SORTED_KEYS) {
    if (lower.endsWith(key)) return TLD_RULES[key]
  }
  return DEFAULT_RULES
}

/** Extract the effective TLD key (the longest TLD_RULES suffix that matches,
 *  or the substring after the last dot if nothing matches). Exported for
 *  pricing (future per-TLD margin) and logging. */
export function getTld(domain: string): string {
  const lower = domain.toLowerCase()
  for (const key of SORTED_KEYS) {
    if (lower.endsWith(key)) return key
  }
  const idx = lower.lastIndexOf('.')
  return idx === -1 ? '' : lower.slice(idx)
}

/** Internal hook for tests: temporarily override rules. Returns a restore fn.
 *  Not exported from any public barrel — test-only. Throws in production to
 *  prevent accidental misuse from corrupting the global rule table. */
export function __setTldRuleForTest(suffix: string, rules: TldRules): () => void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__setTldRuleForTest must not be called in production')
  }
  const existed = suffix in TLD_RULES
  const prev = TLD_RULES[suffix]
  TLD_RULES[suffix] = rules
  if (!SORTED_KEYS.includes(suffix)) {
    SORTED_KEYS.push(suffix)
    SORTED_KEYS.sort((a, b) => b.length - a.length)
  }
  return () => {
    if (existed) {
      TLD_RULES[suffix] = prev
    } else {
      delete TLD_RULES[suffix]
      const idx = SORTED_KEYS.indexOf(suffix)
      if (idx !== -1) SORTED_KEYS.splice(idx, 1)
    }
  }
}

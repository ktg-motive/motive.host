// Motive Hosting pricing — markup on OpenSRS wholesale cost

const DEFAULT_MARGIN = 0.20 // 20% markup

// Per-TLD margin overrides (if needed)
const TLD_MARGINS: Record<string, number> = {
  // '.com': 0.25,
  // '.io': 0.30,
}

export function getCustomerPrice(opensrsPrice: number, tld?: string): number {
  const margin: number = (tld ? TLD_MARGINS[tld] : undefined) ?? DEFAULT_MARGIN
  const raw = opensrsPrice * (1 + margin)
  return Math.round(raw) // Round to nearest dollar for clean display
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function priceToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

import type { StorageTier } from '@opensrs-email';

export const EMAIL_PRICES: Record<StorageTier, { monthly: number; label: string }> = {
  basic:    { monthly: 300,  label: '$3/mo' },
  standard: { monthly: 500,  label: '$5/mo' },
  plus:     { monthly: 800,  label: '$8/mo' },
};

export function getStripePriceId(tier: StorageTier): string {
  const map: Record<StorageTier, string> = {
    basic: process.env.STRIPE_PRICE_MAIL_BASIC!,
    standard: process.env.STRIPE_PRICE_MAIL_STANDARD!,
    plus: process.env.STRIPE_PRICE_MAIL_PLUS!,
  };
  return map[tier];
}

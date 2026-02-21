// Plan tier definitions — nautical naming convention
// Prices in USD/month

export interface Plan {
  id: 'harbor' | 'gulf' | 'horizon' | 'captain';
  name: string;
  price: number;
  sites: number;
  emailDomains: number;
  mailboxes: number;
  storage: number; // GB
  support: string;
}

export const PLANS: Record<Plan['id'], Plan> = {
  harbor: {
    id: 'harbor',
    name: 'Harbor',
    price: 99,
    sites: 1,
    emailDomains: 1,
    mailboxes: 5,
    storage: 10,
    support: 'Email',
  },
  gulf: {
    id: 'gulf',
    name: 'Gulf',
    price: 179,
    sites: 3,
    emailDomains: 3,
    mailboxes: 25,
    storage: 50,
    support: 'Priority Email',
  },
  horizon: {
    id: 'horizon',
    name: 'Horizon',
    price: 249,
    sites: 10,
    emailDomains: 10,
    mailboxes: 100,
    storage: 200,
    support: 'Priority Email + Phone',
  },
  captain: {
    id: 'captain',
    name: 'Captain',
    price: 499,
    sites: 25,
    emailDomains: 25,
    mailboxes: 500,
    storage: 500,
    support: 'Dedicated Account Manager',
  },
};

export function getPlan(planId: string | null | undefined): Plan | null {
  if (!planId) return null;
  return PLANS[planId as Plan['id']] ?? null;
}

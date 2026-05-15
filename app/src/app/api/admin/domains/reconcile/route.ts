import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenSRSClient } from '@opensrs';

// Statuses (lowercased) from GET_ORDER_INFO that mean the registration landed.
const TERMINAL_SUCCESS = new Set(['completed', 'processed', 'delivered', 'active']);
// Statuses that mean the order cannot recover. We don't mutate the row — Stripe
// payment was already captured, so this needs manual intervention.
const TERMINAL_FAILURE = new Set(['declined', 'cancelled', 'canceled', 'failed']);

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
});

/**
 * Admin: poll OpenSRS for every domain with status='pending' and flip it to
 * 'active' if the order landed. Stuck/failed orders are reported back for
 * manual review (we don't auto-delete — payment was already taken). Use this
 * after a registration timeout left the row as pending.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminDb = createAdminClient();
  // Only registration-pending rows — opensrs_order_id is the registration
  // order. Transfers track state in transfer_status/transfer_order_id and
  // never share this code path.
  const { data: pendingDomains, error: selectErr } = await adminDb
    .from('domains')
    .select('id, domain_name, opensrs_order_id, customer_id')
    .eq('status', 'pending')
    .not('opensrs_order_id', 'is', null);

  if (selectErr) {
    return NextResponse.json({ error: 'Failed to load pending domains' }, { status: 500 });
  }

  const reconciled: Array<{ domain: string; orderId: string | null }> = [];
  const stillPending: Array<{ domain: string; orderId: string | null; status: string }> = [];
  const failed: Array<{ domain: string; orderId: string | null; status: string }> = [];
  const errors: Array<{ domain: string; error: string }> = [];

  for (const d of pendingDomains ?? []) {
    if (!d.opensrs_order_id) {
      errors.push({ domain: d.domain_name, error: 'no opensrs_order_id on row' });
      continue;
    }
    try {
      const info = await opensrs.getRegistrationStatus(d.opensrs_order_id);
      const status = typeof info.status === 'string' ? info.status.toLowerCase() : '';

      if (TERMINAL_SUCCESS.has(status)) {
        const { error: updateErr } = await adminDb
          .from('domains')
          .update({ status: 'active' })
          .eq('id', d.id);
        if (updateErr) {
          errors.push({ domain: d.domain_name, error: updateErr.message });
        } else {
          reconciled.push({ domain: d.domain_name, orderId: d.opensrs_order_id });
        }
      } else if (TERMINAL_FAILURE.has(status)) {
        // Don't auto-mutate — Stripe was charged, manual intervention required.
        failed.push({ domain: d.domain_name, orderId: d.opensrs_order_id, status });
      } else {
        stillPending.push({ domain: d.domain_name, orderId: d.opensrs_order_id, status: status || 'unknown' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      errors.push({ domain: d.domain_name, error: msg });
    }
  }

  return NextResponse.json({
    checked: pendingDomains?.length ?? 0,
    reconciled,
    stillPending,
    failed,
    errors,
  });
}

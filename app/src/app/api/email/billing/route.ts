import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EMAIL_PRICES } from '@/lib/email-pricing';
import type { StorageTier } from '@opensrs-email';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: mailboxes, error } = await supabase
      .from('email_mailboxes')
      .select('id, email_address, storage_tier, stripe_price_id, domain_name')
      .eq('customer_id', user.id)
      .neq('status', 'deleted');

    if (error) {
      console.error('Error fetching billing:', error);
      return NextResponse.json({ error: 'Failed to fetch billing data' }, { status: 500 });
    }

    // Group by tier
    const byTier: Record<string, number> = { basic: 0, standard: 0, plus: 0 };
    let monthlyTotal = 0;

    for (const mb of mailboxes ?? []) {
      const tier = mb.storage_tier as StorageTier;
      byTier[tier] = (byTier[tier] ?? 0) + 1;
      monthlyTotal += EMAIL_PRICES[tier]?.monthly ?? 0;
    }

    return NextResponse.json({
      mailboxes,
      summary: {
        totalMailboxes: mailboxes?.length ?? 0,
        byTier,
        monthlyTotalCents: monthlyTotal,
        monthlyTotalFormatted: `$${(monthlyTotal / 100).toFixed(2)}/mo`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

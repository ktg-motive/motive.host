import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth';
import { getOMAClient } from '@/lib/opensrs-email-client';
import { stripe } from '@/lib/stripe';
import { handleApiError } from '@/lib/api-utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const db = isAdmin(user.id) ? createAdminClient() : supabase;

    const { data: emailDomain, error } = await (isAdmin(user.id)
      ? db.from('email_domains').select('*').eq('domain_name', decodedDomain).single()
      : db.from('email_domains').select('*').eq('domain_name', decodedDomain).eq('customer_id', user.id).single()
    );

    if (error || !emailDomain) {
      return NextResponse.json({ error: 'Email domain not found' }, { status: 404 });
    }

    return NextResponse.json({ emailDomain });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const admin = createAdminClient();

    const { data: emailDomain } = await admin
      .from('email_domains')
      .select('id')
      .eq('domain_name', decodedDomain)
      .single();

    if (!emailDomain) {
      return NextResponse.json({ error: 'Email domain not found' }, { status: 404 });
    }

    // Get all active mailboxes to clean up Stripe
    const { data: mailboxes } = await admin
      .from('email_mailboxes')
      .select('id, stripe_subscription_item_id, storage_quota_bytes')
      .eq('email_domain_id', emailDomain.id)
      .neq('status', 'deleted');

    // Delete from OMA
    const oma = getOMAClient();
    await oma.deleteDomain(decodedDomain);

    // Remove Stripe subscription items
    if (mailboxes) {
      for (const mb of mailboxes) {
        if (mb.stripe_subscription_item_id) {
          try {
            await stripe.subscriptionItems.del(mb.stripe_subscription_item_id, {
              proration_behavior: 'create_prorations',
            });
          } catch (e) {
            console.error('Failed to remove Stripe item:', e);
          }
        }
      }
    }

    // Soft-delete mailboxes
    await admin
      .from('email_mailboxes')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('email_domain_id', emailDomain.id);

    // Mark domain as deleted
    await admin
      .from('email_domains')
      .update({ opensrs_status: 'deleted' })
      .eq('id', emailDomain.id);

    // Audit log
    await admin.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: 'domain_deleted',
      target_type: 'domain',
      target_id: emailDomain.id,
      target_label: decodedDomain,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

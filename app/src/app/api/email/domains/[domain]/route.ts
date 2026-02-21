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
    const admin = await isAdmin(user.id);
    const db = admin ? createAdminClient() : supabase;

    const { data: emailDomain, error } = await (admin
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

    if (!(await isAdmin(user.id))) {
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
      .neq('status', 'deleted')
      .neq('status', 'pending_billing_cleanup');

    // Delete from OMA
    const oma = getOMAClient();
    await oma.deleteDomain(decodedDomain);

    // Remove Stripe subscription items -- track failures
    const stripeFailures: Array<{ mailbox_id: string; item_id: string; error: string }> = [];
    if (mailboxes) {
      for (const mb of mailboxes) {
        if (mb.stripe_subscription_item_id) {
          try {
            await stripe.subscriptionItems.del(mb.stripe_subscription_item_id, {
              proration_behavior: 'create_prorations',
            });
          } catch (e) {
            stripeFailures.push({
              mailbox_id: mb.id,
              item_id: mb.stripe_subscription_item_id,
              error: String(e),
            });
            console.error(`Failed to remove Stripe item ${mb.stripe_subscription_item_id}:`, e);
          }
        }
      }
    }

    const hasStripeFailures = stripeFailures.length > 0;

    // Soft-delete mailboxes -- flag those with billing issues
    if (mailboxes) {
      for (const mb of mailboxes) {
        const failed = stripeFailures.find(f => f.mailbox_id === mb.id);
        await admin
          .from('email_mailboxes')
          .update({
            status: failed ? 'pending_billing_cleanup' : 'deleted',
            deleted_at: new Date().toISOString(),
            ...(failed && {
              billing_error: `Subscription item deletion failed: ${failed.item_id}`,
              billing_error_at: new Date().toISOString(),
            }),
          })
          .eq('id', mb.id);
      }
    }

    // Mark domain status based on billing cleanup state
    await admin
      .from('email_domains')
      .update({ opensrs_status: hasStripeFailures ? 'pending_billing_cleanup' : 'deleted' })
      .eq('id', emailDomain.id);

    // Audit log
    await admin.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: hasStripeFailures ? 'billing_cleanup_pending' : 'domain_deleted',
      target_type: 'domain',
      target_id: emailDomain.id,
      target_label: decodedDomain,
      ...(hasStripeFailures && { details: { stripe_failures: stripeFailures } }),
    });

    return NextResponse.json({
      success: true,
      ...(hasStripeFailures && {
        warning: 'Domain deleted but some billing items need manual cleanup',
        stripe_failures: stripeFailures,
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

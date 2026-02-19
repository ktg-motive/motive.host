import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth';
import { getOMAClient } from '@/lib/opensrs-email-client';
import { stripe } from '@/lib/stripe';
import { createMailboxSchema } from '@/lib/email-schemas';
import { generatePassword } from '@/lib/password';
import { getStripePriceId, EMAIL_PRICES } from '@/lib/email-pricing';
import { STORAGE_TIERS } from '@opensrs-email';
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

    const { data, error } = await (isAdmin(user.id)
      ? db.from('email_mailboxes').select('*').eq('domain_name', decodedDomain).neq('status', 'deleted').order('created_at', { ascending: true })
      : db.from('email_mailboxes').select('*').eq('domain_name', decodedDomain).eq('customer_id', user.id).neq('status', 'deleted').order('created_at', { ascending: true })
    );

    if (error) {
      console.error('Error listing mailboxes:', error);
      return NextResponse.json({ error: 'Failed to list mailboxes' }, { status: 500 });
    }

    return NextResponse.json({ mailboxes: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const body = await request.json();
    const parsed = createMailboxSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify domain ownership + email enabled
    const { data: emailDomain } = await supabase
      .from('email_domains')
      .select('id, customer_id, domain_name, opensrs_status')
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .single();

    if (!emailDomain || emailDomain.opensrs_status !== 'active') {
      return NextResponse.json({ error: 'Email domain not found or not active' }, { status: 404 });
    }

    const { localPart, displayName, storageTier } = parsed.data;
    const emailAddress = `${localPart}@${decodedDomain}`;
    const password = parsed.data.password ?? generatePassword();

    // Create mailbox via OMA
    const oma = getOMAClient();
    try {
      await oma.changeUser(emailAddress, {
        password,
        type: 'mailbox',
        displayName,
        storageTier,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OMA error';
      if (message.includes('already exists')) {
        return NextResponse.json({ error: 'Email address already in use' }, { status: 409 });
      }
      throw err;
    }

    // Add Stripe subscription item
    const { data: customer } = await supabase
      .from('customers')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();

    let stripeItemId: string | null = null;
    const stripePriceId = getStripePriceId(storageTier);

    if (customer?.stripe_subscription_id && stripePriceId) {
      const item = await stripe.subscriptionItems.create({
        subscription: customer.stripe_subscription_id,
        price: stripePriceId,
        quantity: 1,
        proration_behavior: 'create_prorations',
      });
      stripeItemId = item.id;
    }

    // Insert Supabase record
    const { data: mailbox, error: insertError } = await supabase
      .from('email_mailboxes')
      .insert({
        email_domain_id: emailDomain.id,
        customer_id: user.id,
        email_address: emailAddress,
        local_part: localPart,
        domain_name: decodedDomain,
        display_name: displayName ?? null,
        storage_tier: storageTier,
        storage_quota_bytes: STORAGE_TIERS[storageTier].bytes,
        stripe_subscription_item_id: stripeItemId,
        stripe_price_id: stripePriceId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert mailbox:', insertError);

      // Compensating rollback: clean up OMA mailbox and Stripe item
      try {
        await oma.deleteUser(emailAddress);
      } catch (rollbackErr) {
        console.error('Rollback: failed to delete OMA mailbox:', rollbackErr);
      }
      if (stripeItemId) {
        try {
          await stripe.subscriptionItems.del(stripeItemId, {
            proration_behavior: 'none',
          });
        } catch (rollbackErr) {
          console.error('Rollback: failed to delete Stripe item:', rollbackErr);
        }
      }

      return NextResponse.json({ error: 'Failed to create mailbox. Please try again.' }, { status: 500 });
    }

    // Update domain counters
    await supabase.rpc('increment_mailbox_count', {
      p_email_domain_id: emailDomain.id,
      p_quota_bytes: STORAGE_TIERS[storageTier].bytes,
    });

    // Audit log
    await supabase.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: 'mailbox_created',
      target_type: 'mailbox',
      target_id: mailbox.id,
      target_label: emailAddress,
      details: { storage_tier: storageTier },
    });

    return NextResponse.json({
      mailbox,
      generatedPassword: password,
    }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

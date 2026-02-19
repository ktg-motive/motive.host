import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth';
import { getOMAClient } from '@/lib/opensrs-email-client';
import { stripe } from '@/lib/stripe';
import { updateMailboxSchema } from '@/lib/email-schemas';
import { getStripePriceId } from '@/lib/email-pricing';
import { STORAGE_TIERS } from '@opensrs-email';
import type { StorageTier } from '@opensrs-email';
import { handleApiError } from '@/lib/api-utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string; email: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain, email } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const decodedEmail = decodeURIComponent(email);
    const db = isAdmin(user.id) ? createAdminClient() : supabase;

    const { data: mailbox } = await (isAdmin(user.id)
      ? db.from('email_mailboxes').select('*').eq('email_address', decodedEmail).eq('domain_name', decodedDomain).neq('status', 'deleted').single()
      : db.from('email_mailboxes').select('*').eq('email_address', decodedEmail).eq('domain_name', decodedDomain).eq('customer_id', user.id).neq('status', 'deleted').single()
    );

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    // Fetch live storage from OMA
    try {
      const oma = getOMAClient();
      const omaUser = await oma.getUser(decodedEmail);
      mailbox.storage_used_bytes = omaUser.disk_usage * 1024 * 1024; // MB to bytes
    } catch {
      // OMA lookup failure is non-fatal — use cached value
    }

    return NextResponse.json({ mailbox });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ domain: string; email: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain, email } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const decodedEmail = decodeURIComponent(email);

    const body = await request.json();
    const parsed = updateMailboxSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify ownership + domain binding
    const { data: mailbox } = await supabase
      .from('email_mailboxes')
      .select('*')
      .eq('email_address', decodedEmail)
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .neq('status', 'deleted')
      .single();

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    const oma = getOMAClient();
    const updates: Record<string, unknown> = {};
    const omaOptions: Record<string, unknown> = {};

    // Handle suspension
    if (parsed.data.suspended !== undefined) {
      omaOptions.suspended = parsed.data.suspended;
      updates.status = parsed.data.suspended ? 'suspended' : 'active';
    }

    // Handle display name
    if (parsed.data.displayName !== undefined) {
      omaOptions.displayName = parsed.data.displayName;
      updates.display_name = parsed.data.displayName;
    }

    // Handle password change required
    if (parsed.data.passwordChangeRequired !== undefined) {
      omaOptions.passwordChangeRequired = parsed.data.passwordChangeRequired;
      updates.password_change_required = parsed.data.passwordChangeRequired;
    }

    // Handle storage tier change
    if (parsed.data.storageTier && parsed.data.storageTier !== mailbox.storage_tier) {
      const newTier = parsed.data.storageTier as StorageTier;
      omaOptions.storageTier = newTier;
      updates.storage_tier = newTier;
      updates.storage_quota_bytes = STORAGE_TIERS[newTier].bytes;

      // Swap Stripe price
      if (mailbox.stripe_subscription_item_id) {
        const newPriceId = getStripePriceId(newTier);
        if (newPriceId) {
          await stripe.subscriptionItems.update(mailbox.stripe_subscription_item_id, {
            price: newPriceId,
            proration_behavior: 'create_prorations',
          });
          updates.stripe_price_id = newPriceId;
        }
      }

      // Update domain storage counters (storage-only, no mailbox_count change)
      const oldBytes = STORAGE_TIERS[mailbox.storage_tier as StorageTier].bytes;
      const newBytes = STORAGE_TIERS[newTier].bytes;
      const diff = newBytes - oldBytes;
      if (diff !== 0) {
        const { data: emailDomain } = await supabase
          .from('email_domains')
          .select('storage_provisioned_bytes')
          .eq('id', mailbox.email_domain_id)
          .single();
        if (emailDomain) {
          await supabase
            .from('email_domains')
            .update({
              storage_provisioned_bytes: Math.max(0, emailDomain.storage_provisioned_bytes + diff),
            })
            .eq('id', mailbox.email_domain_id);
        }
      }
    }

    // Apply OMA changes
    if (Object.keys(omaOptions).length > 0) {
      await oma.changeUser(decodedEmail, omaOptions);
    }

    // Update Supabase
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('email_mailboxes')
        .update(updates)
        .eq('id', mailbox.id);
    }

    // Audit log
    if (parsed.data.suspended !== undefined) {
      await supabase.from('email_audit_log').insert({
        customer_id: user.id,
        actor_id: user.id,
        action: parsed.data.suspended ? 'mailbox_suspended' : 'mailbox_reactivated',
        target_type: 'mailbox',
        target_id: mailbox.id,
        target_label: decodedEmail,
      });
    }
    if (parsed.data.storageTier) {
      await supabase.from('email_audit_log').insert({
        customer_id: user.id,
        actor_id: user.id,
        action: 'storage_changed',
        target_type: 'mailbox',
        target_id: mailbox.id,
        target_label: decodedEmail,
        details: { from: mailbox.storage_tier, to: parsed.data.storageTier },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ domain: string; email: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain, email } = await params;
    const decodedDomain = decodeURIComponent(domain);
    const decodedEmail = decodeURIComponent(email);

    const { data: mailbox } = await supabase
      .from('email_mailboxes')
      .select('*')
      .eq('email_address', decodedEmail)
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .neq('status', 'deleted')
      .single();

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    // Delete from OMA
    const oma = getOMAClient();
    await oma.deleteUser(decodedEmail);

    // Remove Stripe subscription item
    if (mailbox.stripe_subscription_item_id) {
      try {
        await stripe.subscriptionItems.del(mailbox.stripe_subscription_item_id, {
          proration_behavior: 'create_prorations',
        });
      } catch (e) {
        console.error('Failed to remove Stripe item:', e);
      }
    }

    // Soft-delete
    await supabase
      .from('email_mailboxes')
      .update({ status: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', mailbox.id);

    // Decrement domain counters
    await supabase.rpc('decrement_mailbox_count', {
      p_email_domain_id: mailbox.email_domain_id,
      p_quota_bytes: mailbox.storage_quota_bytes,
    });

    // Audit log
    await supabase.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: 'mailbox_deleted',
      target_type: 'mailbox',
      target_id: mailbox.id,
      target_label: decodedEmail,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

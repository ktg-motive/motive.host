import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth';
import { getOMAClient } from '@/lib/opensrs-email-client';
import { provisionDomainSchema } from '@/lib/email-schemas';
import { autoConfigureDns } from '@/lib/email-dns';
import { handleApiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = isAdmin(user.id) ? createAdminClient() : supabase;

    const selectFields = `
      id, domain_id, domain_name, opensrs_status,
      mx_verified, spf_verified, dkim_verified, dmarc_verified,
      mailbox_count, storage_used_bytes, storage_provisioned_bytes,
      created_at
    `
    const { data, error } = await (isAdmin(user.id)
      ? db.from('email_domains').select(selectFields).neq('opensrs_status', 'deleted').order('created_at', { ascending: false })
      : db.from('email_domains').select(selectFields).eq('customer_id', user.id).neq('opensrs_status', 'deleted').order('created_at', { ascending: false })
    );

    if (error) {
      console.error('Error listing email domains:', error);
      return NextResponse.json({ error: 'Failed to list domains' }, { status: 500 });
    }

    return NextResponse.json({ domains: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const parsed = provisionDomainSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: domain } = await supabase
      .from('domains')
      .select('id, domain_name, customer_id')
      .eq('id', parsed.data.domainId)
      .eq('customer_id', user.id)
      .single();

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Check if already provisioned
    const { data: existing } = await supabase
      .from('email_domains')
      .select('id')
      .eq('domain_id', domain.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Email already enabled for this domain' }, { status: 409 });
    }

    // Provision with OMA
    const oma = getOMAClient();
    await oma.changeDomain(domain.domain_name);

    // Get DKIM record from OMA
    const domainInfo = await oma.getDomain(domain.domain_name);

    // Insert Supabase record
    const { data: emailDomain, error: insertError } = await supabase
      .from('email_domains')
      .insert({
        domain_id: domain.id,
        customer_id: user.id,
        domain_name: domain.domain_name,
        opensrs_status: 'active',
        dkim_selector: domainInfo.dkim_selector ?? null,
        dkim_record: domainInfo.dkim_record ?? null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert email domain:', insertError);

      // Compensating rollback: remove OMA domain to avoid orphan
      try {
        await oma.deleteDomain(domain.domain_name);
      } catch (rollbackErr) {
        console.error('Rollback: failed to delete OMA domain:', rollbackErr);
      }

      return NextResponse.json({ error: 'Failed to enable email. Please try again.' }, { status: 500 });
    }

    // Auto-configure DNS (best-effort)
    const dnsResult = await autoConfigureDns(domain.domain_name, domainInfo);

    // Audit log
    await supabase.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: 'domain_provisioned',
      target_type: 'domain',
      target_id: emailDomain.id,
      target_label: domain.domain_name,
      details: { dns_auto_configured: dnsResult.success },
    });

    return NextResponse.json({ emailDomain, dnsResult }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

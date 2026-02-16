import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyEmailDns } from '@/lib/email-dns-verify';
import { handleApiError } from '@/lib/api-utils';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    // Fetch email domain record for DKIM info
    const { data: emailDomain } = await supabase
      .from('email_domains')
      .select('id, dkim_selector, dkim_record, customer_id')
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .single();

    if (!emailDomain) {
      return NextResponse.json({ error: 'Email domain not found' }, { status: 404 });
    }

    // Perform DNS verification
    const dkimInfo = emailDomain.dkim_selector && emailDomain.dkim_record
      ? { selector: emailDomain.dkim_selector, record: emailDomain.dkim_record }
      : null;

    const result = await verifyEmailDns(decodedDomain, dkimInfo);

    // Update verification flags
    await supabase
      .from('email_domains')
      .update({
        mx_verified: result.mx.verified,
        spf_verified: result.spf.verified,
        dkim_verified: result.dkim.verified,
        dmarc_verified: result.dmarc.verified,
      })
      .eq('id', emailDomain.id);

    return NextResponse.json({ verification: result });
  } catch (err) {
    return handleApiError(err);
  }
}

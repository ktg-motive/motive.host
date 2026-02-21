import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOMAClient } from '@/lib/opensrs-email-client';
import { resetPasswordSchema } from '@/lib/email-schemas';
import { generatePassword } from '@/lib/password';
import { handleApiError } from '@/lib/api-utils';

export async function POST(
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
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify ownership + domain binding
    const { data: mailbox } = await supabase
      .from('email_mailboxes')
      .select('id, customer_id')
      .eq('email_address', decodedEmail)
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .neq('status', 'deleted')
      .neq('status', 'pending_billing_cleanup')
      .single();

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 });
    }

    const password = parsed.data.password ?? generatePassword();

    // Reset via OMA
    const oma = getOMAClient();
    await oma.changeUser(decodedEmail, { password });

    // Audit log
    await supabase.from('email_audit_log').insert({
      customer_id: user.id,
      actor_id: user.id,
      action: 'password_reset',
      target_type: 'mailbox',
      target_id: mailbox.id,
      target_label: decodedEmail,
    });

    return NextResponse.json({ generatedPassword: password }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

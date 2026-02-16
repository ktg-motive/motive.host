import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateMigrationSchema } from '@/lib/email-schemas';
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

    // Get email domain
    const { data: emailDomain } = await supabase
      .from('email_domains')
      .select('id')
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .single();

    if (!emailDomain) {
      return NextResponse.json({ error: 'Email domain not found' }, { status: 404 });
    }

    const { data: migration } = await supabase
      .from('email_migrations')
      .select('*')
      .eq('email_domain_id', emailDomain.id)
      .single();

    return NextResponse.json({ migration });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
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
    const parsed = updateMigrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: emailDomain } = await supabase
      .from('email_domains')
      .select('id')
      .eq('domain_name', decodedDomain)
      .eq('customer_id', user.id)
      .single();

    if (!emailDomain) {
      return NextResponse.json({ error: 'Email domain not found' }, { status: 404 });
    }

    // Upsert: check if migration exists
    const { data: existing } = await supabase
      .from('email_migrations')
      .select('id, checklist')
      .eq('email_domain_id', emailDomain.id)
      .single();

    if (existing) {
      // Merge checklist
      const mergedChecklist = parsed.data.checklist
        ? { ...existing.checklist, ...parsed.data.checklist }
        : existing.checklist;

      const updates: Record<string, unknown> = { checklist: mergedChecklist };
      if (parsed.data.oldProvider !== undefined) updates.old_provider = parsed.data.oldProvider;
      if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
      if (parsed.data.status !== undefined) {
        updates.status = parsed.data.status;
        if (parsed.data.status === 'completed') {
          updates.completed_at = new Date().toISOString();
        }
      }

      await supabase
        .from('email_migrations')
        .update(updates)
        .eq('id', existing.id);

      return NextResponse.json({ success: true });
    }

    // Create new migration
    await supabase
      .from('email_migrations')
      .insert({
        email_domain_id: emailDomain.id,
        customer_id: user.id,
        checklist: parsed.data.checklist ?? {},
        old_provider: parsed.data.oldProvider ?? null,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status ?? 'in_progress',
      });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

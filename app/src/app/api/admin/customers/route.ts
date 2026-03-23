import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCustomerSchema } from '@/lib/customer-schemas';
import { sendCustomerWelcomeEmail } from '@/lib/sendgrid';

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Check admin status
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const adminDb = createAdminClient();

  // 4. Create auth user
  const { data: authData, error: authError } = await adminDb.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (authError) {
    const msg = authError.message?.toLowerCase() ?? '';
    if (msg.includes('already registered') || msg.includes('already exists')) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 },
      );
    }
    console.error('[create-customer] auth.admin.createUser failed:', authError);
    return NextResponse.json(
      { error: 'Failed to create auth user' },
      { status: 500 },
    );
  }

  const authUser = authData.user;

  // 5. Wait for handle_new_user trigger, then update customer row
  const updatePayload = {
    plan: input.plan,
    display_name: input.display_name || null,
    company_name: input.company_name || null,
    phone: input.phone || null,
    plan_started_at: new Date().toISOString(),
  };

  let updateResult = await adminDb
    .from('customers')
    .update(updatePayload)
    .eq('id', authUser.id)
    .select('id, email, name, plan, created_at')
    .single();

  // If trigger hasn't fired yet, wait 500ms and retry once
  if (!updateResult.data) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    updateResult = await adminDb
      .from('customers')
      .update(updatePayload)
      .eq('id', authUser.id)
      .select('id, email, name, plan, created_at')
      .single();
  }

  if (!updateResult.data) {
    console.error('[create-customer] customer row not found after retry for user:', authUser.id);
    // Clean up the orphaned auth user so a retry doesn't hit 409
    await adminDb.auth.admin.deleteUser(authUser.id).catch((err) =>
      console.error('[create-customer] failed to clean up auth user:', err)
    );
    return NextResponse.json(
      { error: 'Customer creation failed — the account was rolled back. Please try again.' },
      { status: 500 },
    );
  }

  // 6. Fire-and-forget welcome email
  if (input.send_welcome_email) {
    sendCustomerWelcomeEmail(
      input.email,
      input.name,
      input.plan,
      input.password,
    ).catch((err) => console.error('[create-customer] welcome email failed:', err));
  }

  return NextResponse.json({ customer: updateResult.data }, { status: 201 });
}

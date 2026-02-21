import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_FIELD_LENGTH = 100;

// Simple HTML tag stripper — rejects any string containing < or >
function containsHtml(value: string): boolean {
  return /<[^>]*>/.test(value);
}

function validateField(name: string, value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') return `${name} must be a string`;
  if (value.length > MAX_FIELD_LENGTH) return `${name} must be ${MAX_FIELD_LENGTH} characters or fewer`;
  if (containsHtml(value)) return `${name} must not contain HTML`;
  return null;
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { display_name, company_name, phone } = body as Record<string, unknown>;

    // Validate each field if present
    for (const [name, value] of Object.entries({ display_name, company_name, phone })) {
      const err = validateField(name, value);
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }
    }

    // Build update object with only provided fields.
    // Treat empty string as null so clearing a field stores null rather than "".
    const updates: Record<string, string | null> = {};
    if (display_name !== undefined) updates.display_name = (display_name as string).trim() || null;
    if (company_name !== undefined) updates.company_name = (company_name as string).trim() || null;
    if (phone !== undefined) updates.phone = (phone as string).trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // RLS ensures user can only update their own row
    const { error: updateError } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in profile update:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

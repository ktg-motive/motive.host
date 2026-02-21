import { createClient } from '@/lib/supabase/server';

export function isAdmin(userId: string): boolean {
  return userId === process.env.ADMIN_USER_ID;
}

export async function isAdminByDb(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

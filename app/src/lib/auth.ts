import { createClient } from '@/lib/supabase/server';

export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

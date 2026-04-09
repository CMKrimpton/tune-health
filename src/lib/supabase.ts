import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '').trim();
const supabaseKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

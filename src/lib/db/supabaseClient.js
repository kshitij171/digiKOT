import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PLACEHOLDER_KEY =
  !supabaseAnonKey ||
  supabaseAnonKey.includes('<paste') ||
  supabaseAnonKey.includes('Publishable');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env. Run: npm run supabase:status'
  );
} else if (PLACEHOLDER_KEY) {
  console.error(
    '[Supabase] VITE_SUPABASE_ANON_KEY is still a placeholder. Copy the Publishable key from: npm run supabase:status'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

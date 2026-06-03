import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl } from './resolveSupabaseUrl.js';

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PLACEHOLDER_KEY =
  !supabaseAnonKey ||
  supabaseAnonKey.includes('<paste') ||
  supabaseAnonKey.includes('Publishable');

if (!supabaseAnonKey) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_ANON_KEY in .env.local. Run: npm run supabase:status'
  );
} else if (PLACEHOLDER_KEY) {
  console.error(
    '[Supabase] VITE_SUPABASE_ANON_KEY is still a placeholder. Copy the Publishable key from: npm run supabase:status'
  );
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  console.info('[Supabase] API URL:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Supabase API URL for the current page.
 * - Phone/tablet opens http://<laptop-ip>:5173 → API http://<laptop-ip>:54321 (no .env IP edit).
 * - Laptop opens http://localhost:5173 → VITE_SUPABASE_URL or http://127.0.0.1:54321
 */
export function resolveSupabaseUrl() {
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const forceEnv = import.meta.env.VITE_SUPABASE_URL_FORCE === 'true';
    if (!forceEnv && hostname && !LOCAL_HOSTS.has(hostname)) {
      const scheme = protocol === 'https:' ? 'https' : 'http';
      return `${scheme}://${hostname}:54321`;
    }
  }

  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  if (envUrl) return envUrl;
  return 'http://127.0.0.1:54321';
}

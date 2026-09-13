import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Missing configuration is reported, not thrown.
 *
 * Throwing here ran at module load, before React mounted, so the whole app
 * died silently and the deployment served a blank white page — the least
 * useful failure there is. A build with no environment variables still
 * succeeds (Vite inlines them as undefined), so this is exactly what a first
 * deploy hits. The app now renders a page that says what is missing.
 */
export const configError =
  !url || !key
    ? "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ne sont pas définies."
    : null;

export const supabase = createClient<Database>(url ?? "https://unconfigured.supabase.co", key ?? "unconfigured", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const PARTNER_PHOTOS_BUCKET = "partner-photos";

/** Private: verification papers, never publicly readable. */
export const PARTNER_DOCUMENTS_BUCKET = "partner-documents";

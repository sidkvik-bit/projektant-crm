import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service_role klient — obchází RLS. Použít výhradně server-side pro operace,
 * které legitimně potřebují přístup napříč organizacemi (např. onboarding,
 * který zakládá novou Organizations, na kterou ještě nemá uživatel žádné
 * oprávnění). Nikdy neimportovat do klientského kódu.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

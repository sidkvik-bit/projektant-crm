import type { User } from "@supabase/supabase-js";

/**
 * Google OAuth přes Supabase dává jen `full_name` (a `avatar_url`), ne oddělené
 * jméno/příjmení — rozdělíme heuristicky na první mezeru. Uživatel si to
 * případně opraví později v profilu (zatím není UI na editaci profilu).
 */
export function extractProfileFields(user: User) {
  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
  const parts = fullName ? fullName.split(/\s+/) : [];
  const [firstName, ...rest] = parts;

  return {
    email: user.email ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    first_name: firstName ?? null,
    last_name: rest.length > 0 ? rest.join(" ") : null,
  };
}

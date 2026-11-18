"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/currentUser";
import { deleteConfirmed } from "@/lib/deleteConfirmation";

export async function confirmDeletion(entity: string, id: string, code: string): Promise<{ error: string }> {
  const user = await getCurrentUserContext();
  if (!user) redirect("/login");
  const result = await deleteConfirmed(await createClient(), user.userId, entity, id, code);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(result.value.basePath ?? "/dashboard");
}

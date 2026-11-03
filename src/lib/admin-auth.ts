import { createClient } from "@supabase/supabase-js";
// Optional legacy Supabase Auth helper. Current admin access uses an application token.
// Keep legacy sessions in memory, never localStorage.
export function createAdminAuth(url: string, publishableKey: string) {
  if (publishableKey.startsWith("sb_secret_"))
    throw Error("Nunca uses una clave secreta en el navegador.");
  try {
    const payload = JSON.parse(atob(publishableKey.split(".")[1] ?? ""));
    if (payload.role === "service_role") throw Error("service_role");
  } catch (error) {
    if (error instanceof Error && error.message === "service_role")
      throw Error("Nunca uses service_role en el navegador.");
  }
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

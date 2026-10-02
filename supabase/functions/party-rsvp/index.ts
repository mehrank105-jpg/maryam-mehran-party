import { createHandler } from "./handler.ts";

function defaultKey(name: string): string {
  try { return JSON.parse(Deno.env.get(name) ?? "{}").default ?? ""; } catch { return ""; }
}

const handler = createHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
  serverKey: defaultKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  guestSigningSecret: Deno.env.get("RSVP_SESSION_SECRET") ?? "",
  adminTokenHash: Deno.env.get("RSVP_ADMIN_TOKEN_HASH") ?? "",
  allowedOrigins: (Deno.env.get("RSVP_ALLOWED_ORIGINS") ?? "https://mehrank105-jpg.github.io").split(",").map(s => s.trim()).filter(Boolean),
});

Deno.serve(handler);

import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_")) {
    throw new Error("Only a Supabase publishable key may be bundled in the browser. Secret keys belong exclusively in the Edge Function environment.");
  }
  return {
  root: "client",
  envDir: "..",
  base: "/maryam-mehran-party/rsvp/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./client/src", import.meta.url)) } },
  css: { postcss: { plugins: [tailwind()] } },
  build: { outDir: "../rsvp", emptyOutDir: true },
  };
});

import { createMockProvider } from "./mock";
import { createSupabaseProvider } from "./supabase";
import type { DataProvider } from "./types";

export function currentMode(): "mock" | "supabase" {
  return import.meta.env.VITE_DATA_MODE === "supabase" ? "supabase" : "mock";
}

export function makeProvider(): DataProvider {
  if (currentMode() === "supabase") {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required when VITE_DATA_MODE=supabase.",
      );
    }
    return createSupabaseProvider(url, key);
  }
  return createMockProvider();
}

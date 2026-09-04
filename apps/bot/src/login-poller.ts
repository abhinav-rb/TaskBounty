import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Api } from "grammy";
import type { Store } from "./store.js";

/**
 * Supabase-only: the desktop app writes a login code into `login_codes`
 * (via the request_login RPC); this poller notices it and DMs the code to the
 * matching person over Telegram. Sent code ids are remembered in memory so a
 * code is delivered once per bot process (codes expire in 5 minutes anyway).
 */
export class LoginCodePoller {
  private sb: SupabaseClient;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sent = new Set<number>();

  constructor(
    url: string,
    serviceKey: string,
    private store: Store,
    private api: Api,
  ) {
    this.sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  start(intervalMs = 4000): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const { data, error } = await this.sb
      .from("login_codes")
      .select("id,phone,code")
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .order("id", { ascending: false })
      .limit(20);
    if (error) {
      console.error("[login-poller]", error.message);
      return;
    }
    for (const row of (data ?? []) as { id: number; phone: string; code: string }[]) {
      if (this.sent.has(row.id)) continue;
      this.sent.add(row.id);
      try {
        const profile = await this.store.getProfileByPhone(row.phone);
        if (profile?.chat_id) {
          await this.api.sendMessage(
            profile.chat_id,
            `🔐 Your TaskBounty login code is ${row.code}\nIt expires in 5 minutes.`,
          );
        }
      } catch (err) {
        console.error("[login-poller] delivery failed:", err);
      }
    }
    if (this.sent.size > 500) this.sent.clear();
  }
}

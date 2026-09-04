import type { Api } from "grammy";

/**
 * Fetch a Telegram photo's bytes (by file_id). The caller persists them via the
 * Store (local disk in SQLite mode, the 'proofs' bucket in Supabase mode). The
 * telegram_file_id is always kept on the submission too, so a failed fetch
 * never loses proof — Telegram keeps the original.
 */
export async function fetchTelegramFileBytes(
  api: Api,
  botToken: string,
  fileId: string,
): Promise<Uint8Array> {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram returned no file_path");
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

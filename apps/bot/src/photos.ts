import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Api } from "grammy";

/**
 * Download a Telegram photo (by file_id) to disk. Best-effort: the file_id is
 * always stored on the submission too, so a failed download never loses proof —
 * Telegram keeps the original and the desktop app can fetch it by file_id later.
 */
export async function downloadPhoto(
  api: Api,
  botToken: string,
  fileId: string,
  destPath: string,
): Promise<void> {
  const file = await api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram returned no file_path");
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, buf);
}

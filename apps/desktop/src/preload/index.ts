import { contextBridge } from "electron";

// Minimal, safe surface exposed to the renderer. Config (Supabase keys / data
// mode) is read in the renderer via import.meta.env, so nothing sensitive
// crosses here.
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
});

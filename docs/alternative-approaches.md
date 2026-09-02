# Three ways to build this differently

The main plan is a **Telegram bot + Tauri desktop app + Supabase**. Here are three genuinely different directions, each swapping out a major pillar, with the trade-offs that matter.

---

## 1. A different messaging channel (not Telegram)

Keep the whole design, change *how the "text bot" reaches people.*

| Option | Upside | Downside |
| --- | --- | --- |
| **WhatsApp Business Cloud API** (Meta) | The app people already use to "text"; native images; feels effortless to non-technical users. | **Not free to run:** since July 2025 it bills **per message** — reminders and login OTPs are paid Utility/Authentication templates (cheap, but not $0), and in-window replies start billing Oct 1 2026. Plus Meta business verification and per-template approval. |
| **SMS / MMS via Twilio** | Truly universal — no app to install, works on any phone. | **Costs money per message**, and **MMS photos are the expensive, region-limited part**; inbound-image handling is clunkier; the weakest media experience. |
| **Discord or Slack bot** | Free, excellent media + buttons, trivial to build, great if the two people already share a server/workspace. | Less "texting-like"; assumes both live in Discord/Slack. |

**When to pick this:** only if familiarity is worth **giving up the $0 goal** — choose **WhatsApp** if the users are non-technical and per-message billing is acceptable; choose **SMS** only if reaching a basic phone with no smart app is a hard requirement and you accept the cost. For a system that must stay free to keep up, **Telegram wins** on *free + media + buttons*.

---

## 2. A different management surface (not a desktop app)

Keep the bot, change *where people review receipts and edit tasks.*

| Option | Upside | Downside |
| --- | --- | --- |
| **Progressive Web App** (React on Vercel/Netlify/Cloudflare Pages, free) | **Nothing to download**; one URL works on laptop *and* phone; instant updates; still "installable" to the desktop/home screen. | Not literally "a downloadable program"; needs network; less of an offline, installed-software feel. |
| **Native mobile app** (React Native / Expo or Flutter) | Puts the management platform on the **same phone** as the messaging — one device for everything; push notifications built in. | App-store friction (or sideloading); more platform-specific work than a web page. |

**When to pick this:** choose the **PWA** to erase install/packaging/code-signing overhead and reach every device from one build — the pragmatic "free management platform" — and choose **mobile** if you'd rather everything live on the phone. The desktop app in the main plan is the right call specifically because you asked for a downloadable program and already ship Tauri in `Dashboard`.

---

## 3. A different architecture entirely (no-code / low-code)

Replace most custom code with glue between existing free tools.

- **Channel:** Telegram (or WhatsApp).
- **Automation:** **n8n** (self-host free) or **Make/Zapier** free tier — draws the workflow visually: on new task, message the Doer; on inbound photo, forward to the Approver; on approval, update the balance.
- **Database *and* management UI:** **Airtable** or **Notion** (free tier). Crucially, these *are* the management platform: a **gallery view** of the tasks table is a ready-made receipts browser with photo thumbnails, and the recurring-tasks table is directly editable by User 2 — no editor to build.

| Upside | Downside |
| --- | --- |
| Fastest path to a working MVP; the "free management platform + admin editor" comes **for free** out of the box; almost no code to maintain. | Less control and weaker custom logic; free tiers cap runs/rows/automation steps; **phone-number login as specified is hard** (Airtable/Notion auth is email/SSO, not phone); vendor lock-in. |

**When to pick this:** ideal for **validating the idea in a weekend** before investing in the custom build. The main plan is the better long-term home once you want exact control over phone-login, the desktop app, and — eventually — real payments.

---

## Recommendation

Start with the **main plan** (Telegram + Tauri + Supabase): it is free, it meets every hard requirement (photo proof, phone login, downloadable desktop app, editable recurring tasks), and it reuses tooling you already run. If you want proof-of-concept **this week**, stand up **Alternative 3** first, then migrate — the data model in [`architecture.md`](architecture.md) ports cleanly.

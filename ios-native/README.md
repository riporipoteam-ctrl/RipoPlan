# AskAI — native iOS app (SwiftUI)

A **fully native SwiftUI app** — not a web view. It talks directly to Supabase
(auth + data over REST) and has its own dark "command center" design, distinct
from the light website.

## What's inside
- **Native UI** (`Sources/`): custom glass tab bar, animated aurora backgrounds,
  spring animations, haptics everywhere, swipe/long-press actions.
  - `HomeView` — ChatGPT-style new chat: greeting, composer, suggestion chips
    (incl. a live World Cup one).
  - `ChatsView` / `ChatView` — threads with search + rename/delete; a live chat
    that polls Supabase for agent replies and shows tool "activity".
  - `AgentsView` — agent grid, detail, and natural-language agent creation.
  - `ActivityView` — notifications + a one-tap **Daily Briefing**.
  - `SettingsView` — profile, notifications, Siri tip, advanced backend URL.
- **Supabase client** (`Supabase.swift`): pure `URLSession` (no SPM deps so it
  builds on a bare CI runner) — email auth, PostgREST queries, token refresh.
- **Background execution**: sending a message enqueues a `background_tasks` row.
  The Cloudflare Worker (cron) runs the agent **server-side**, so work continues
  even if the app is closed or the phone is off — the result is waiting when you
  reopen the app.
- **Notifications** (`NotifManager.swift`): local notifications (work for a
  sideloaded app — no APNs/paid account needed). Daily briefing + "task complete"
  alerts fired from `BGAppRefresh` polling (`TaskRunner.swift`).
- **Siri / Shortcuts** (`Intents.swift`): "Hey Siri, Ask AskAI to …" hands a task
  to your agents hands-free.

> Note: remote push (APNs) needs a paid Apple Developer account + entitlements,
> which a free Sideloadly install can't use — so AskAI uses **local**
> notifications, which work great when sideloaded.

## Get the .ipa (no Mac needed)
`.github/workflows/ios.yml` builds an **unsigned `.ipa`** on a free GitHub macOS
runner, uploads the **`AskAI-ipa`** artifact, attaches it to the rolling
**`ios-latest`** pre-release, and captures a Simulator screenshot.

### Sideload onto your iPhone
Open the `.ipa` with **Sideloadly** or **AltStore** — they re-sign it with your
own free Apple ID and install it (free IDs expire after 7 days).

## Build locally (with a Mac)
```bash
brew install xcodegen
cd ios-native
xcodegen generate
open AskAI.xcodeproj   # Run on your device/simulator
```

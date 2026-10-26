# XP404 — Xparty

Deployable release of Xparty watch rooms, live IPTV, synchronized playback and video chat.

Render configuration:

- Repository: `PKX404/xp404`, branch `main`
- Root directory: leave empty
- Build: `npm ci --omit=dev`
- Start: `npm start`
- Health check: `/health`
- Node: 22 or newer

Set the existing public `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Render's environment settings. Never put local env files or secret keys in Git. No database migration runs during build or startup.

New rooms are public by default. The host can change their listing to private. The call controls and fullscreen call panel stay hidden without an active requested video call.

Adaptive HLS streams support Auto, High, Mid and Low data modes. Fixed-quality files and provider-controlled players cannot be compressed by this setting. Calls across restrictive networks need TURN configuration.

This release is frozen separately from the development workspace. Unfinished universal search, moving room previews and the latest 80/20 layout refinements remain local for a later release.

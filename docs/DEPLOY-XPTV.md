# XPTV verified web snapshot

Deploy target: https://xptv.onrender.com (existing Render service srv-dbertpks728c73d87gn0).
Repository: PKX404/xptv; branch: main; root directory: web-service.
Build: npm ci --omit=dev. Start: npm start. Health: /health.
Node >=22, one instance. Keep automatic deployment off; deploy an explicitly verified commit.

## Configuration
- SUPABASE_URL and SUPABASE_ANON_KEY: existing public project configuration. Never use service-role keys.
- TRUST_PROXY=1 behind Render; RENDER_EXTERNAL_URL is automatically allowed by the server.
- Optional YOUTUBE_API_KEY makes keyword search use the official API. Public-search fallback depends on YouTube availability.
- TURN_URLS + TURN_SECRET, or ICE_SERVERS_JSON, are required for reliable calls across restrictive networks. STUN-only calls cannot always connect.
- Keep all secrets in Render environment settings, never Git.
- Add the live URL to Supabase Auth redirect URLs before email links/password recovery are considered verified. No SQL migration is part of deployment.

## Verified behavior and limits
This snapshot contains the accepted responsive room, dedicated player, live IPTV and local media ambient lighting, new supplied PNG logo, saved channels, optional country and language filters, transparent chat, camera attachments, public @ mentions, request-based calls, PiP, and adaptive HLS data modes.
High selects the best available encoded stream; Mid targets <=720p/1.5 Mbps and Low <=360p/0.5 Mbps, falling back to the lowest rendition. Auto uses HLS throughput/buffer adaptation. Source variants, not on-the-fly server transcoding, provide the savings. Audio and transport overhead are additional. Browser-native HLS, fixed files, iframe and native providers may control their own quality; the UI states this limitation.

Browser YouTube iframe pixels remain inaccessible to native ambient rendering without an appropriate capture/native path. YouTube startup contract is fixture-tested, not proof of every real video. DRM subscription providers still require their supported companion/native path; no credentials are extracted.

Render Free may cold-start. Rooms, uploads, attachment state and signaling are instance-local and can be lost on restart/deploy. Database-backed accounts are separate. Do not scale the process to multiple instances without shared room/signaling storage. Existing reconnection backoff restores surviving rooms but cannot resurrect a destroyed instance.

## Release verification
110 serial Node tests passed on 26 October 2026. Browser checks passed for decoded local/direct/upload playback, responsive 320-1920px layouts, camera attachment delivery, public mentions, camera invitation accept/decline, two decoded synthetic cameras, participant side rail, host seek convergence <750ms on localhost, and forced socket reconnect preserving the live camera track. These are local checks, not global latency or live database compatibility guarantees.

## Keep unfinished work local
Continue development in the existing xparty/xparty-service workspace. Copy only a reviewed snapshot into this repository, run its checks, commit, push, and manually deploy that commit. Do not merge unrelated XParty PRs or execute account migration scripts as part of release.

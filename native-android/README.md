# XParty Native Android Foundation (v0.1)

This is a **separate native prototype**, not a replacement for production XParty v31.6.

## Native in this build
- Android Activity, panels, source picker, tiles, room lobby, chat and emoji panel (not a whole-app WebView).
- Connects directly to the existing XParty `wss://xp404.onrender.com/ws` protocol. Room create/join/resume, chat, state, reconnection and voting are live server operations.
- Media3 ExoPlayer for HTTPS IPTV/HLS/MP4 and a first-picture watchdog to avoid silent audio-only video playback. Audio-only radio streams are not a target for the watchdog.
- YouTube video playback **only** through YouTube's embedded iframe/WebView player, not through stream extraction. Video search uses the room server's /api/search with the room access token.
- Native source tiles (1 / 2 / 3 columns), an emoji picker, saved sources, and a native blurred-background treatment based on YouTube posters/channel logos.
- Majority-skip enabled by default by hosts when entering a room, subject to the existing server requirements (two or more participants and a queued video).
- Netflix and Prime Video buttons open their official services. **No DRM circumvention, no provider playback inside XParty.**

## NOT completed / not verified
- Existing v31.6's complete visual parity; Google/Apple/Instagram authentication; file uploading; multi-participant native video calls and voice calls; chat attachments; YouTube search recommendations/thumbnail durations at full quality; source-channel availability health checks; video-frame immersive background capture.
- Android mic button will request permission safely but will **not** transmit audio. This is explicitly a placeholder until a proper WebRTC implementation is tested.
- Native source tiling and video-picture recovery need physical Android testing with real devices/channels.
- Synchronization is clock-aware but YouTube's embedding API, buffering, internet latency and DRM restrictions prevent guaranteed millisecond-perfect equality.
- This debug APK uses a separate package `com.pkx404.xpartynative`. It **can install alongside** the existing XParty application rather than replacing it.

## Build
`cd native-android && gradle :app:assembleDebug`

CI uploads the debug APK under the `XParty Native Android Preview` workflow.

## Safety and provider compliance
Netflix, Prime Video and other protected media remain in their own official applications. This implementation neither captures their video nor bypasses DRM. A contractual provider integration would be required for an authorized custom DRM experience.

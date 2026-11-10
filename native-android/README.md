# XParty Native Android — v0.2 development preview

This is a **native Android implementation in progress**, NOT a full feature-identical replacement for XParty v31.6.

## Implemented in Android Java

- Native Android lobby, room UI, source grid, message composer and extensive emoji picker.
- Existing XParty room protocol: create/join/resume, chat, source, playback and majority skip votes.
- Native Media3/ExoPlayer playback for HTTPS HLS IPTV and direct streams, including a first-video-frame watchdog.
- Native, bounded video drift correction every 250 ms; this does not guarantee millisecond-level synchronization over a real network.
- **New in v0.2:** native WebRTC signaling compatible with XParty room messages, microphone and camera controls, call seats, peer connections, remote video surfaces and echo-cancellation configuration.
- **New in v0.2:** native PixelCopy sampling of the application's **non-protected** video surface to tint a blurred immersive room background. Protected/DRM playback is never sampled.
- Source tiles with 1/2/3-column settings, saved sources and health indicator checks.
- YouTube search with thumbnails and official YouTube iframe embedded playback. The YouTube player itself uses an official web component; it is NOT a native YouTube decoder.
- Netflix and Prime Video shortcuts open their official services; no DRM circumvention.
- Majority-skip voting requested by the host automatically on room entry.

## Verification

- GitHub Actions Gradle debug APK build: **passed**.
- Android 10 emulator install, initial launch, process-survival check, forced close and relaunch: **passed**.
- The automated test is NOT a two-device call or a full integration test.
- Mic/camera WebRTC interoperability, real IPTV frame sampling, call stability, varying network types, YouTube sync and speed on physical devices still need tests.

## Still incomplete vs XParty v31.6

- Pixel-identical UI/UX, all interaction and layout states, profiles/accounts and OAuth, full participant settings/moderation, file transfer and attachments, comprehensive call recovery and adaptive bandwidth, music glow and other immersive modes.
- A multi-device end-to-end WebRTC call was **not** validated.
- DRM services cannot be rendered inside XParty as if authorized; provider integration and licensing would be needed.
- Native YouTube components remain provider-controlled embedded views.

Package name: com.pkx404.xpartynative. The debug APK installs **alongside** the original XParty. Do not uninstall the original app.

Build: cd native-android && gradle :app:assembleDebug.

Verified APK build: https://github.com/PKX404/xp404/actions/runs/42794790700

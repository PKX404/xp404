# XParty Native Android — Visual Parity Milestone v0.2

This is a new **fully native Android shell and room interface**, with a separate install package `com.pkx404.xpartynative`, built from XParty's own source and brand assets. It is not the production XParty app and does **not** replace v31.6. The existing server at `xp404.onrender.com` remains unchanged.

## Implemented in the working APK

- XParty original launcher/wordmark and screenshot-inspired native header: Exit, room settings, Search, logo, video search, Invite, Participants (with live member count).
- Fixed native Media3 player surface with fullscreen, play/pause, progress, video scaling, volume and video-like interactions.
- Matching gradient video-room panel, split Video Call/Chat tabs, host badge/crown, source artwork and Now Watching row.
- Chat bottom bar, fixed above the Android keyboard, with @ insertion, emoji selection, text send and reaction/reply/edit/delete/read support.
- Android-specific keyboard layout: temporarily hides top header and unnecessary composer icons while typing, restores them when the keyboard closes.
- Native WebSocket connect/create/join/reconnect, real-time chat, room state, host-only source selection, room locking, party modes and side-panel host moderation.
- Media3 ExoPlayer for IPTV and compatible direct video, local files on-device; YouTube uses the provider-required embedded player only.

## Still NOT at full v31.6 functional parity

**This build is a feature-and-style migration milestone, not a fully equivalent clone.** Native WebRTC calling, active microphone/video tiles, attached photo/video/file sharing, Google/Instagram sign-in, accounts/friends/social discovery, advanced YouTube recommendation and sync logic, synced uploaded local file playback, complete room moderation, notification and accessibility details remain to be ported. Video Call and attachment controls explicitly say these features are unavailable instead of pretending they work.

Android WebView is used **only** for YouTube's official embedded video; the room UI, menus, player, navigation, chat and connectivity use Android-native views.

## Build and validation

Java 17, Android Gradle Plugin 8.11.1, compile SDK 36, AndroidX Media3 and OkHttp.
```
cd android-native
gradle :app:assembleDebug
```
The CI workflow builds the signed debug APK and performs a native startup smoke test on an Android emulator.

## Next integration work

Port WebRTC via Android peer connections with the current server signaling protocol, replace all remaining placeholder controls, port account and friends systems, expand source picker and queuing, then perform screenshot and behavioral regression comparison against every original v31.6 screen. Do not claim full parity until these are working on actual devices.

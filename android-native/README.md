# XParty Native – Phase 1

A genuinely native Android implementation **started from the current XParty backend protocol**. This is deliberately a distinct application `com.pkx404.xpartynative` so it does not replace or alter the working XParty v31.6 package.

## Native features in this milestone
- Native Android lobby, create and join room, connection status and automatic reconnect through the existing xp404 WebSocket backend.
- Native watch-room layout, live room participant count, real-time chat, host source controls.
- AndroidX Media3 ExoPlayer for IPTV (HTTPS HLS) and HTTPS MP4/WebM, with an Android player view. Local file playback on the device.
- Official YouTube iframe embedded inside a dedicated isolated player surface; this is a provider requirement, **not** the old XParty web frontend.
- IPTV category directory and searchable channel picker.
- Room playback events (play, pause, seek) for compatible media; the server remains authoritative.

## Not yet at parity with v31.6
This is **not** an exact clone or a replacement for v31.6. Native video-call/WebRTC, Google sign-in, friend/social panels, attachments, synced file transfer, advanced themes/UX, complete YouTube sync, room moderation and all other v31.6 features remain migration work. Browser embeds are required for YouTube by its player API, so `100% WebView-free YouTube` is not a supported playback option.

## Build
```sh
cd android-native
gradle :app:assembleDebug
```

Do not uninstall your v31.6 production app when trying this preview.

# XParty Native Android — alpha migration

This is a **new Android application**, not the XParty WebView wrapper. The native UI is built with Android Views, rooms use the existing XParty WebSocket protocol, IPTV/direct/local videos use AndroidX Media3/ExoPlayer, and peer calls use native WebRTC. YouTube is a special case: the official YouTube IFrame API runs in a media-only WebView surface, with the rest of the app native. No original web app bundle or CSS/JavaScript UI is loaded.

## Build and install

Open `android-native/` in Android Studio, or run:

```bash
gradle --no-daemon -p android-native :app:assembleDebug
```

Requires Java 17, Gradle 8.13, Android SDK 36 and Android Gradle Plugin 8.13.2. The APK is produced at `android-native/app/build/outputs/apk/debug/app-debug.apk`. GitHub Actions workflow `.github/workflows/xparty-native-apk.yml` also builds, verifies signature and resources, and uploads an APK artifact.

The alpha package ID is `com.pkx404.xparty.nativeapp`, so it installs separately from previous XParty APKs. It uses a debug certificate. Register the eventual production certificate and package ID with OAuth providers before production authentication.

## Native implementations already in this alpha

- Explore room directory and Join Invite screens; create, join and resume XParty rooms.
- Real-time WebSocket events and deduplicated local chat rendering.
- Native video player for IPTV (HLS), HTTPS direct video and temporary shared local files.
- Play/pause, seek, volume, fit/zoom/stretch controls, audio-language preference, one fullscreen toggle and auto-hide playback rail.
- Native source selection: YouTube link/search via existing room API, IPTV country playlists, HTTPS stream URL and Android system video picker.
- Native microphone/camera capture, WebRTC peer signaling, live video call panel and participant list.
- Host room end, kick, host transfer, public/private listing, share invite.
- Source changes tear down the previous media decoder; native player and room UI are not web UI.

## Still incomplete — do not advertise this as feature-parity or production-ready

- Google/Apple/phone/Instagram authentication and account friendship system are not yet ported.
- YouTube video playback uses YouTube's official iframe player; it is **not** a Media3 decoded source. YouTube synchronization, policy compliance and real-device playback require validation.
- WebRTC peer renegotiation and TURN/NAT handling require two-device testing over independent networks. Not a production-complete video-call stack yet.
- Rich chat attachments/reactions/read receipts, poll controls, full Explore visual previews, Reo companion and all v25–v31 UI refinements are not yet native.
- App is a debug-signed test APK. Physical device installation and playback have **not** been tested.
- Local-video upload supports content-URI files but still needs cancellation/resume UX and MIME-specific file handling.
- The room server is unchanged; it remains hosted on Render and retains the room-lifecycle policies. Full end-to-end tests are required before shipping.

## Implementation layout

- `RoomSocket.java`: native WebSocket guest session, room messages and bounded reconnection.
- `NativePlayer.java`: Media3 HLS/MP4/direct + isolated official YouTube iframe.
- `NativeCall.java`: WebRTC camera/microphone, offers/answers/ICE signaling.
- `SourcePicker.java`: native YouTube search/links, IPTV country list, local-file navigation.
- `LocalFileUploader.java`: chunked room file upload, no full-file buffering.
- `NativeUi.java`: common non-WebView UI elements.
- `MainActivity.java`: Explore, Join Invite, room, chat, video and participant controls.

## Validation checklist

1. Install the GitHub-generated APK next to existing XParty releases (different application ID).
2. Create a room on device A and join with invite code on device B.
3. Chat from both devices, background/relaunch, verify each participant is counted once.
4. Check direct MP4 playback, Indian IPTV M3U/HLS, source switching and no audio-only ghost player.
5. Validate YouTube iframe readiness and synchronized play/pause without violating YouTube policy.
6. Grant camera/mic permissions on both devices; verify two-way call and NAT relay.
7. Test portrait/landscape and Android keyboard resize without changing video player dimensions.
8. Check room end/kick/host-transfer and empty-room timeout.
9. Confirm no duplicate fullscreen, ping displays or controls when no source selected.
10. Run security review and configure production signing and accounts before publishing.

**Note:** This folder intentionally does not replace `android-test/` or deploy anything to the live XParty/Krezi server.

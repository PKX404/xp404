# Xparty Android test wrapper

This is a test-only Android WebView shell for https://xp4040.onrender.com/.

It is NOT the production Xparty APK, does NOT embed ExoPlayer, and does NOT
implement a foreground media service. In particular, background playback,
Android hardware decoding/surface clipping and notification media actions
are **not guaranteed**. It intentionally uses the web fallback player.

It supports:
- HTTPS-only origin allowlist.
- Android camera/microphone runtime permissions granted only upon a website media request.
- Android 13+ notification permission with return-to-app notification.
- Content document chooser for chat uploads.
- Black startup overlay until the page loads.

Build: gradle :app:assembleDebug
Output: app/build/outputs/apk/debug/app-debug.apk
GitHub Actions: Xparty Android test APK → workflow runs → downloadable artifact.

# XParty Native v0.4.1 — issue audit, implementation and validation

**Reference:** User's XParty 31.6 screenshots (portrait and landscape). Scope: independently installable Android-native app. Existing XParty 31.6 and `xp404.onrender.com` are not overwritten.

## Root causes and work completed

| Issue | Cause in v0.4 | Native v0.4.1 change | Verification status |
| --- | --- | --- | --- |
| Mic tap exited to Android home | Eager WebRTC factory/EGL/SurfaceRenderer initialization in `attach()`, even with no call seat or permission; native/GPU failures could terminate process | Keep call UI lightweight until explicit mic/camera permission and call membership; defer JNI/renderer startup; catch setup failures; open call panel when mic tapped | Needs actual device mic and two-party call test. |
| Landscape room looked like narrow portrait stack | Only vertical `LinearLayout` in `showRoom`, no `onConfigurationChanged` layout handling | Reparent existing *uninterrupted* video and room panel into 60/40 left/right landscape; keep chat at bottom of the right pane, hide top header/footer; restore on portrait | Requires screenshot/device test. |
| Ambient showed a recognizable smeared image | Frame blurred with small kernel and drawn over panel at 91% opacity | 80x45 source, broad Gaussian, 4fps PixelCopy, diffuse translucent color wash and common glass palette for source/settings/emoji/plus | Approximates original. Pixel-for-pixel equivalence **not established**, especially for protected YouTube/DRM frames. |
| Emoji popup was a tall scrollable text dialog | Android AlertDialog `setItems` | Inline compact 6-column emoji grid with Smileys/Hearts/Reactions/Fun tabs | UI compilation; device test pending. |
| Plus showed four rows in system dialog | Generic `AlertDialog` | Anchored vertical four-icon popup linked to actual document/gallery/camera picker logic | UI compilation; upload needs device test. |
| Participants covered the screen; people icon clipped | Right-sided Dialog without moving room; strokes exited icon bounds | 40%-wide sheet + room slide animation, repaired icon geometry | UI compilation; device test pending. |
| Only Fit or Zoom scaling | Toggle between two Media3 resize modes | Choose Fit, Stretch, Zoom, Fixed Width, Fixed Height (Media3 sources). YouTube retains provider controls. | Compile; playback test pending. |
| YouTube Browse did not scroll | Nested Android ScrollView intercepting WebView gestures; browser instances left allocated | Prevent parent touch interception during browsing; explicit browser teardown on tab switch/dismiss | Needs actual YouTube web navigation test. |
| YouTube search capped at 12 | Hardcoded server cap 12; native cap 24 | Server search up to 48–50; real `nextPageToken` when configured with official Data API; 20-card gradual loading up to 250 | Native code ready; the separate Render backend needs to run the upgraded search implementation to provide full pagination. |
| Clicking YouTube suggested card escaped to YouTube | Embedded iframe navigation not handled; player source ID not updated | Observe actual YouTube player video ID changes via documented playback data; route suggested ID to room host/source; block top-level navigation to external site | Works only where YouTube's permitted iframe API reports ID/navigation; cannot intercept all provider-owned interfaces. |
| Netflix/Prime cards appear fake | No authorized DRM playback integration | Explicitly launch official app/site, explain each member must have eligible subscription and protected in-app synchronization is not implemented | Safe launch only, **not** full watch-party playback. |
| Crashes on room exit with live color extraction | PixelCopy callback may race against a shut-down background executor | Guard rejected background work after renderer shutdown | Build test. |
| Universal APK large | Bundles native WebRTC and multiple architectures; ABI-specific builds smaller | Keep ABI-specific release packages and a universal fallback. Preserve native calling dependencies. | Actual size available after release build. |

## Layout measurements

- Portrait: compact 58dp top header; player locked to initial width/16:9; fixed bottom composer 65dp; ambient chat panel uses remaining height.
- Landscape: hide room header/footer; horizontal main body uses 60% player / 40% ambient room panel; chat composer placed inside right panel, 58dp; no player instance teardown when changing orientation.
- Participants: target 40% of screen width; room slides left 12% on open, returns upon dismissal.
- Icons: preserve >42dp accessible touch targets but draw smaller internal line art, as requested.

## Remaining high-priority work

1. Capture a genuine crash log from an affected Samsung/OnePlus Android device on mic tap; Java catches cannot prevent a native WebRTC SIGSEGV.
2. Run two phones through real media calls (permission, join/leave, reconnect, front/back camera).
3. Compare landscape screenshot pixels and video position against v31.6 on the same device.
4. Validate YouTube browsing/playlist suggestions and preferred quality under YouTube's current IFrame restrictions.
5. Test protected media fallback. PixelCopy cannot read secure decoder surfaces; exact backdrop is impossible without permitted frame access.
6. Obtain licensed playback integration to offer real synchronized Netflix/Prime streaming. No DRM circumvention or sharing account credentials.

**Do not call v0.4.1 full feature parity or crash-free until these device tests pass.**

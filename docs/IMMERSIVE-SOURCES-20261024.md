# Shared immersive video backgrounds

The local preview at http://localhost:8787 serves the updated source files. No production deployment, PR merge, or database change was performed.

## Frame paths

| Playback | Frame path | Status |
| --- | --- | --- |
| Uploaded/local files, Drive files loaded as videos, direct MP4/WebM, IPTV/HLS | The current HTML video element supplies the same room-wide GPU renderer. | Real MP4 and HLS browser playback verified. Drive login/import was not exercised. |
| Native Android files, direct video, IPTV | Existing single decoder texture supplies foreground and ambient layers. | Existing bridge regression passed; device decoding remains unverified. |
| Android YouTube, Vimeo, Twitch embeds | New private message-port sampler uses PixelCopy on the visible player rectangle, downscaled to 20x12, at most 10 Hz. The browser renderer consumes those frames. | Java/D8 compile and simulated-port lifecycle tests pass. Actual WebView video/PixelCopy still needs Android hardware validation. |
| Desktop/mobile browser cross-origin embeds | Existing fluid/artwork fallback. | Live provider pixels are not exposed by these iframe APIs. No live-frame claim. |
| Netflix/Prime companion; SoundCloud audio | Existing fallback. | These paths supply no in-room video frames. Subscription playback integration is not completed by this change. |

No getDisplayMedia call, second video decoder, media download proxy, or background opt-in was added. Android PixelCopy does not override protected surfaces. Failed copies retain the fluid fallback; a protected surface can also appear black. Embedded samples cover the composited player, so visible player controls can affect the light field.

## Behavior

- Ambient accepts a player-supplied frame source rather than an internal provider allowlist.
- Presented-frame callbacks drive ordinary video. A 100 ms watchdog samples the current decoded frame if callbacks stall when the video scrolls offscreen.
- WebGL loss/unavailability uses a 20x12 canvas with 25 px blur, 1.3 saturation, 0.8 brightness and 1.3 scale, preserving real frames instead of switching to animated colors.
- Pause/reduced motion freeze work. Source changes, hidden rooms, navigation and destruction clear/cancel stale work. The native bridge rejects old source IDs/generations, bounds image payloads and keeps only one image decode in flight.
- The existing GPU appearance and sharp foreground remain intact. Made4Love / INSPIRED BY AANCHAL is preserved.

## Validation

- `npm test`: 78 passing tests. Three old test fixtures were corrected for explicit capacity, seven-character codes and queued states before a member joined; production admission rules were not weakened.
- `tests/ambient-preview-browser.cjs` against `http://localhost:8787`: real CC0 MP4 upload, direct-link source switch, presented-frame updates, full viewport, pause, GPU-loss fallback/recovery, offscreen updates, home/return, 390/320 px layouts, dedication and no capture requests.
- `tests/iptv-browser.cjs`: real public directory and HLS.js manifests/segments, main playback, moving background, fullscreen and no capture prompt. The Mux reference is VOD carried over HLS; it is not evidence that every live channel works.
- `tests/embedded-ambient-browser.cjs`: synthetic native payloads through the private bridge, real PNG decode/render, empty room, source/generation rejection, no-WebGL fallback, pause, reduced motion, home/return, error and cleanup. This is not Android runtime validation.
- `tests/native-video-browser.cjs`: existing simulated native-player bridge regression.
- Android Java and D8 compilation pass. No emulator/device, signing or installation performed.

Evidence: `deliverables/redesign/ambient-preview-validation.json`, `ambient-*-localhost.png`, `tests-current.log`; Android `build/d8-ambient-validation.log`. Browser screenshots use Chrome's SwiftShader software renderer and are not hardware performance benchmarks.

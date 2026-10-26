# Room redesign review

The background now fills the viewport behind video, chat, participants and margins. Immersive backgrounds are automatic in every room, with no on/off or Live background controls. The old per-device off preference is ignored. Watch sources opens the provider picker separately; selecting a source closes it so mobile chat stays closer to playback. The participant sheet provides photos, status, search, profile access and the existing moderation controls. Chat has explicit white text and dark translucent surfaces across themes.

## Frame rendering

Files and CORS-enabled direct links use the same decoded video element as the player. requestVideoFrameCallback drives rendering with one outstanding callback and no frame backlog; older browsers use animation frames and skip unchanged media times. There is no four-Hz render timer or CSS color interpolation. A one-second watchdog only checks lifecycle state.

The independent WebGL renderer downsizes to 256 × 144 and uses two Gaussian passes, pairing adjacent taps through bilinear filtering for 13 texture reads per pass instead of 25. Texture storage is reused and normal rendering avoids CPU pixel readback. Final grading uses saturation 1.5 and a 0.75 luma ceiling. Unsupported WebGL falls back to a small palette at at most 10 Hz. Pause and reduced motion retain a still frame; a hidden room/document stops rendering. Graphics context loss switches to the fluid fallback, and restoration rebuilds GPU resources and redraws even when playback is paused.

The home page uses an original procedural WebGL fluid field: moving purple, magenta and teal light, capped at roughly 30 draws per second and a longest canvas dimension of 480 pixels. The same renderer provides the automatic room fallback. YouTube artwork supplies its palette; other iframe services use the default room palette. The field stops when covered by native video frames or when the page is hidden, respects reduced motion, and has an animated CSS fallback for unavailable/lost WebGL. It runs without cookies, optional preference storage or any permission prompt.

Screen capture has been removed from the background implementation. Cross-origin iframe and protected provider pixels remain inaccessible; their fluid backdrop is animated rather than synchronized footage. Cookie consent cannot replace the browser-required, user-initiated screen-capture prompt. No claim of automatic live iframe frame access is made.

The supplied Xparty decompiled shaders and participant layouts were inspected read-only. They informed blur/grading and avatar/name/action layout choices. No proprietary implementation/assets were copied; no runtime Xparty comparison was available. Native SurfaceTexture behavior, dithering, exact output and complete Xparty feature parity are not claimed.

## Providers

| Button | Implemented path | Boundary |
|---|---|---|
| YouTube | Existing official embedded player/search | Availability/embed permissions apply |
| Vimeo | Official embedded player | Public embeddable video |
| Twitch | Official channel/VOD player | Live edge timing differs; no live seeking; minimum 400 × 300, horizontally scrollable on narrow screens |
| SoundCloud | Official widget with millisecond/second conversion | Public single tracks only |
| Netflix / Prime Video | Optional desktop extension pairs each user's own signed-in service tab with the room timeline | Preview; actual signed-in playback unverified; no embedded/mobile/DRM frame access |
| Google Drive | Existing protected account library route | Google account/provider configuration required |
| Video link / Your files | Native playback | CORS/codec support or temporary file transfer |

The requested all-service parity is not complete: Disney+, HBO Max, Crunchyroll, Tubi, Pluto TV, X and Google Photos still need separate integrations and provider validation. These appear in [Xparty's current service list](https://xparty.io/faq); no working integration is claimed here for them.

The companion validates origins, tab/document/source IDs and random pairing nonces. It exchanges bounded playback state, never room tokens, account sessions, cookies or chat. Provider user actions return through existing host/approval/controller rules. It disconnects on stale pair/room/source and suppresses command feedback. Installation, known advert/episode limits and the exact host allowlist are in [the companion README](../browser-extension/README.md).

## Verification and limits

Frame-pump tests check scheduling, cancellation and duplicate-frame suppression. Real WebSocket tests cover the new providers, canonical URLs, host approval, unauthorized playback, queue transitions, live buffer behavior and extension download. Provider SDK and extension APIs are simulated in focused tests; those do not establish actual service support.

The isolated Chrome browser suite decodes MDN's CC0 MP4, checks frame updates, full-viewport bounds, white chat text, pause, reduced motion, graphics context recovery while paused, participant actions and provider UI. The final software-GPU run produced 25 updates in 1.4 seconds, p95 render cost 3.1 ms and maximum observed media timestamp difference 0.041 seconds. All 69 current Node tests pass; four obsolete capture tests were removed with the capture feature. These are local measurements, not hardware frame-rate or end-to-end latency promises. The earlier redesign GPU checks capped white at RGB 191, preserved spatial red/blue regions and reported no GL errors. Viewports checked across the suites: 320, 390, 844 and 1366 pixels.

The new automatic-background browser suite verifies animated home rendering, room/home transitions, minimal cookie preferences, an old saved off preference, zero screen-capture calls, reduced motion, page lifecycle suspension, context loss/restoration and no horizontal overflow at 320/390/1366 pixels. Home screenshots were visually reviewed at desktop and phone sizes. Native playback also verifies that the covered fluid renderer does not continue animating.

Browser suites: `tests/automatic-background-browser.cjs` and `tests/immersive-room-browser.cjs` pass on the automatic-background revision. `tests/redesign-browser.cjs` and `tests/auth-browser.cjs` passed on the preceding room redesign revision. Set PLAYWRIGHT_MODULE and CHROMIUM_PATH to installed Playwright/Chrome. The immersive suite downloads the [MDN CC0 fixture](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4); TEST_VIDEO_PATH supports an offline copy. Installed extension lifecycle, actual provider accounts and physical Android remain unverified. See [schema and deployment findings](SCHEMA-RESULTS-20261022.md); no migration or deployment was performed.

Technical references: [browser screen-capture requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [video-frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback), [Twitch embedding](https://dev.twitch.tv/docs/embed/video-and-clips/), [SoundCloud widget](https://developers.soundcloud.com/docs/api/html5-widget).

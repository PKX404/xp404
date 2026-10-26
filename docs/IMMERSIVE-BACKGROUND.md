# Immersive background — historical first implementation

Superseded by [ROOM-REDESIGN-REVIEW-20261022.md](ROOM-REDESIGN-REVIEW-20261022.md). The notes below describe the earlier chat-only implementation; the current renderer is always on, covers the whole viewport, follows decoded native video frames and uses a fluid home/provider fallback. Background controls and screen capture have been removed.

Local implementation, 2026-10-22. The chat panel's Immersive button replaces the old Ambient label and retains the per-device on/off preference. The background now preserves the complete video frame behind the conversation instead of reducing it to three colors.

Reference inspected read-only: user-supplied Xparty 9.0.45 (2345) decompiled tree, res/raw/bg_fragment_shader.glsl, bg_vertex_shader.glsl, blur_fragment_shader.glsl and smali/com/wemesh/android/rearch/shaders/DualSurfaceVideoRenderer.smali (horizontal pass around lines 12390-12480). Static observation: external video texture is transformed to a quad; blur uses separable Gaussian sampling; grading runs only on the final pass, with saturation 1.5 and a luma ceiling of 0.75. No runtime behavior was observed.

XParty uses independently written WebGL 1 shaders with browser canvas input, two 25-tap passes at 256 x 144, sigma 8, and final-pass saturation/highlight grading. These buffer size and sigma values are XParty design choices. Xparty's Bayer dither, native SurfaceTexture pipeline, and additional blur surfaces are not reproduced. This is a browser adaptation, not an exact native renderer port.

Local files provide live frames at up to four updates per second. YouTube uses a thumbnail unless the user explicitly selects the current XParty tab through Live colors. Browser iframe isolation still applies; this does not provide direct access to YouTube frames in the Android wrapper. Unsupported WebGL falls back to the existing palette background. Paused/reduced-motion views retain a still frame; hidden views stop sampling. Context loss hides the canvas until page reload. Leaving or disabling clears the frame; destroy releases GPU resources.

Validation: 45 existing tests pass; npm run check and immersive.js syntax check pass. HTTP serving verified for root and /xparty module URLs. No browser is connected, and Playwright/Chromium test dependencies are unavailable, so GPU shader compilation, visual appearance, real capture, and physical Android behavior remain unverified. No deployment performed for this change.

Follow-up verification: isolated Chrome 155 rendered the actual WebGL shaders successfully. White was capped to RGB 191, red/blue frame regions stayed spatially distinct, and WebGL reported zero errors. The redesigned room passed viewport checks at 320/390/844/1366 px. Real provider frame capture and physical Android behavior remain unverified. See REDESIGN-20261022.md.

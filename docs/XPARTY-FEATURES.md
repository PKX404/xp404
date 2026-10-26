# Xparty-inspired browser features

This change extends Xparty's existing watch-room implementation. It does not claim complete Xparty parity. The source baseline is `PKX404/xparty` main, commit `c6a6fb0c5bd3c5ba3895e79ee3b4601d7fb08566`. The live Render deployment has not been changed.

## What is available

| Capability | Xparty behavior |
|---|---|
| Synchronized YouTube and shared local videos | Existing server timeline, readiness, reconnect and buffering behavior preserved. |
| Host approval, host only and shared control | Existing permissions and controller leases preserved. |
| Public watch parties | Added searchable opt-in room listings. New and existing rooms remain private until the current host publishes a title. Locked, full and host-offline rooms disappear from the directory. |
| Invitations | Added copyable invitation URLs. Opening a URL prepares the join form; it does not automatically join, replace an active room, or enable media. |
| Playlist control | Added separate playlist/vote order and auto-advance settings. The displayed vote order matches the server's next selection. Hosts can move playlist items up or down. |
| Vote to skip | Added host-enabled majority skipping, off by default. Votes require the current video identifier, a queued video, an online host, at least two online members and a strict majority. Votes reset when the source changes. Online membership changes also recalculate the majority. |
| Ambient chat background | Added locally sampled colors from playing local video, capped at four samples per second. YouTube defaults to thumbnail colors with gentle animation. Ambient can be switched off and respects reduced motion, paused playback and hidden-page scheduling. |
| Actual YouTube live colors | On browsers supporting Capture Handle, the viewer can explicitly choose **Live colors** and select this Xparty tab. The app verifies the exact tab handle and origin, samples only the movie-stage rectangle, and never sends the captured stream to calls or the server. Other tabs, windows and screens are rejected. Capture stops on leave, disable, page exit or a mismatched capture handle. |
| Local-video subtitles | Added per-device SRT/VTT loading with timing validation, size/cue limits and plain caption text. Tracks are cleared on source change. No subtitle upload is made. Existing YouTube CC remains. |
| Voice, video, chat, polls, moderation and friends | Existing implementations preserved. Account-backed features still require the existing Supabase/provider setup. |

## How to use

1. Run the service from `xparty-service` with `npm ci` and `npm start` (`npm.cmd` in Windows PowerShell if script execution is restricted).
2. At Home, use **Refresh** under **Find a watch party** to fetch public rooms. A listing may fill or close before joining; normal server admission still applies.
3. In a room's **Control** menu, open **Room listing & invite**. Only the current host can publish or unpublish it. The dialog explains exactly what a public listing exposes.
4. Under **Up next**, choose playlist or vote order, set **Auto advance**, and optionally enable **Majority skip**. Guests cannot change host settings.
5. Use **Ambient** in the chat header. **Live colors**, when offered for YouTube, opens the browser's tab picker only after a click. The background works without tab capture using thumbnail colors.
6. For a shared local video, use **Add subtitles** in the playback strip and select an SRT or VTT file. Captions apply to this viewer's device; use CC to toggle them.

## Xparty evidence and limits

The supplied desktop package is Xparty **1.18.28**, ASAR SHA-256 `608502e0a792b9f3e215769ba70cc584218b22e3dcb6ce43c76e66cc1c4179d1`.

- REA extraction evidence: `ev_5483f3434698dfa0d089f7a1e4fa465d2ccb5c369c87bebaa8139048e7fa10ab`.
- Broad static analysis: `ev_e98f33de1fd4e74f959100a07c329d592fd409d5ac2a28931a9c6ef7f378d7ee`. It timed out and remains partial.
- Focused package/preload/chunk analysis: `ev_11e7f68523fe61e2cf59b218a0a499d5ec5f26413338b4ba4fb4ef5618da598d`. Its selected files were parsed; unselected files remain unknown.
- Inert renderer text contains `ambientBackgroundInFullScreen`, a setter for that setting, leader-choice/playback labels and leadership-transfer references. These establish packaged settings/labels, not observed runtime behavior or proof of the rendering algorithm. Xparty's ambient implementation is an independent design.
- The unpacked `iat_meter.node` companion file contradicts its archive integrity metadata. REA recorded this as observed-untrusted; no native module was executed.
- The [official Xparty FAQ](https://xparty.io/faq) describes content providers, room-link invitations and finding rooms. It does not establish that Xparty supports those providers.

No Xparty app code was executed, copied into Xparty or used as a runtime dependency. Local analysis observations are saved outside the application under `analysis/`.

## Deferred work

The user chose to finish browser-compatible features before choosing subscription-streaming infrastructure. Netflix, Prime, Disney+, HBO Max and other provider integrations are therefore not implemented or advertised here. A desktop companion or a hosted browser service needs a separate design and provider-specific validation. A plain iframe is insufficient.

Xparty-scale audience sizes, its native desktop behavior, XpartyDJ, account service operations and complete provider parity are outside this completed browser feature set. Xparty retains its existing 10-member room and four-call-seat limits. TURN and optional account provider configuration remain necessary for real deployment capabilities.

## Verification

Run `npm test` and `npm run check`. Added tests exercise actual HTTP/WebSocket permissions, privacy, queue transitions and skip voting, along with pure subtitle parsing, ambient capture validation/cropping and mocked capture cleanup.

This environment has no connected browser surface, so browser screenshots, the real tab picker, live YouTube colors, real video synchronization and cross-network calls have not been visually/end-to-end validated. The live Render URL could not be reached from available browsing tools. These limitations are not passing media tests.

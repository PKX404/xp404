# XParty 0.5.8 investigation and implementation record

Date: 15 November 2026. This is an incremental repair of the native application, not a claim of full Rave feature parity.

## Confirmed defects and changes

| Problem | Evidence in 0.5.7 | Repair |
| --- | --- | --- |
| Send disappears with typed text | TextWatcher required both `imeShown` and nonempty text; layout updates repeated that condition | Send visibility depends on trimmed message content, including pasted text and keyboard dismissal |
| Numbered playlist entries | NativeSourceSheet generated `Playlist track N` from YouTube IDs | Resolve public titles, creator and artwork through provider oEmbed; resolve asynchronously and cache; show video ID only when metadata is unavailable |
| Artwork/artist disappear on next track | Queue entries contained those fields but server `choose` and advancement reconstructed sources without them | Preserve artist, artwork and duration on selection, next, previous and vote-based advancement |
| Main panel does not update metadata | Same source ID skipped `loadSource`, but no separate metadata render ran | Update native title/artwork separately, without resetting playback or its bridge generation |
| Extra YouTube play tap | YouTube still used a synthetic `loadDataWithBaseURL` document while SoundCloud had moved to an intercepted hosted document | Use the same actual HTTPS player-document origin; preserve host readiness/autostart and explicit paused-room state |
| TV directory opens cold | Directory load began only when its sheet opened | Preload the selected country's catalogue on room entry; coalesce concurrent requests and reuse existing cache |

The queue remains vote-ranked, with stable ordering for ties. Metadata is scoped to current source/queue IDs and only the host can publish shared changes. Delayed metadata cannot change a newer source. Native metadata lookup is bounded to four workers and six-second requests; it does not block room creation or media startup. Provider failures remain visible rather than inventing a track name.

## Rave reference evidence

Input: supplied `Rave_v9.0.58(2358).apks`.
SHA-256: `43506d038f7d770e516856d078dedb8ef9198870b19bee8658e366433008662a`.

Tools actually run: JADX 1.5.6 and Ghidra 12.2 headless, using JDK 25 for Ghidra. Decompiled reference code and binaries are not included in XParty.

| Layer | Observed evidence | What this establishes |
| --- | --- | --- |
| Shared playback clock | `com.wemesh.android.legacy.core.ClockManager`; Ghidra JNI entry points in `libwemesh-ndk.so` | A dedicated native synchronization-clock boundary, with separate current-time and offset queries |
| Native clock calls | `getCurrentSyncTime` calls `sync_get_current_unix_time`; `getCurrentSyncOffset` calls `sync_get_offset` | Time and offset are explicit inputs to synchronization; this is not proof of a particular measured drift bound |
| Audio waveform extraction | Ghidra analyzed `libamplituda-native-lib.so` (AARCH64, 852 functions), including `Java_com_linc_amplituda_Amplituda_amplitudesFromAudioJNI` | A native audio-amplitude extraction capability is present; not proof that every SoundCloud waveform uses this library |
| Audio presentation | References to `AudioChromePresenter`, `AudioChromeView`, `onScrubCommit`, `configureControls`, and `presentComments` in JADX output | Separate audio-specific controls, scrubbing and comments presentation |
| SoundCloud resolution | `SoundCloudApi.resolvePlayback` and `apiGet` references, plus unavailable/DRM-only exception types | Provider-specific resolution and failure handling, rather than only displaying a logo |
| Subscription providers | Netflix manifest/error models and Amazon manifest models in the binary | Provider-specific data structures exist; their presence alone does not establish runtime availability, licensing, or transferable integration rights |

Ghidra native input hashes:
- `libwemesh-ndk.so`: `01bdd119865332dae9d2b41aa8f8efb1499daafc2b12f99c35b1e6674cbfa299`
- `libamplituda-native-lib.so`: `95e31cdda6a02ea3af88ac447e8003e505c5c984772c2247f3d5a78e912866dc`

Limits: the full JADX pass reported 323 decompilation errors; findings above are restricted to readable classes, references and analyzed native entry points. No authenticated Rave runtime session was tested. These findings do not constitute an exact reconstruction of Rave's entire architecture.

## Provider and audio limitations

XParty SoundCloud remains an official embedded player with native room controls and metadata, not a transplanted Rave implementation. Netflix and Prime currently open their own authorized service pages; automatic in-room playback/synchronization is not implemented. `ProviderSession` explicitly disables cross-app notification-based session access. No protected-media extraction, copied credentials, or DRM bypass has been introduced.

The current call controller preserves routing on ordinary mic activation and requests echo/noise processing. Only an explicit speaker/earpiece action changes Android communication mode. Emulator activation tests do not prove audible mixing quality, Bluetooth routing, echo suppression, or uninterrupted playback on a physical phone. Those acceptance items remain open.

TV preloading means the selected country's directory, not opening every live stream or downloading every country's catalogue on a weak connection. Provider startup time and network conditions still bound time to first frame. The backend is currently on Render's free plan; cold starts can affect room creation. No paid infrastructure change was made.

## Validation

- 132 local tests passed in the Android source branch, including source-scoped metadata updates, rejected guest/stale updates, unchanged playback revision, and queue advancement retaining metadata.
- 125 local tests passed on the backend deployment branch.
- Backend commit: `b761268f7de9e25cf28da1a2032ffb2dedfc7fa7`; deployment reached `live`.
- Android candidate commit: `0c584248a589e9e3255cf8ef0f1c476b9c2948b3`.
- Android CI: https://github.com/PKX404/xp404/actions/runs/43670792174 . Final results must be read before claiming device/emulator playback success.
- The release is a test-signed, separate-install QA package. Physical-device installation and audio validation remain separate from emulator checks.

## Next acceptance work

1. Verify Send and named tracks on the reporting phone; measure actual YouTube startup and provider failures.
2. Test two physical phones during concurrent playback/calls, including Bluetooth, speaker, headset, network loss and reconnection; record playback drift and audio-route changes.
3. Establish authorized Netflix/Prime provider integration before claiming in-room parity.
4. Measure cold versus warm room joins and live-stream startup; make hosting changes only with explicit cost approval.
5. Finish chat visual parity separately from the functional Send fix, with real-device screenshots and accessibility checks.

## Progress bar and permissions follow-up

The player progress bar now uses red played progress, grey buffered progress and a muted remaining track, with a red circular scrub thumb. Buffer data comes from Media3 buffered position, YouTube `getVideoLoadedFraction`, or SoundCloud `LOAD_PROGRESS.loadProgress`. No estimated loading animation is used. The supplied Rave manifest declares `POST_NOTIFICATIONS` (posting its own notifications), but inspection found no `NotificationListenerService`, `BIND_NOTIFICATION_LISTENER_SERVICE`, or accessibility service binding. XParty does not add any of these permissions. Posting notifications is different from reading other applications' notifications.

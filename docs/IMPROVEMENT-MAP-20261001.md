# Xparty improvement map and validation

This revision preserves the lime Hero design. Version 0.10.0 implements the core room improvements. Browser interface and simulated playback checks now pass. The account/cloud services and real-device media validation remain incomplete; this is not completion of every requested feature.

| Requested outcome | Revision / remaining work |
|---|---|
| Remember name, omit home username | Home field hidden; remembered identity and first-use naming remain. |
| Fast reliable sync; manual auto-sync | Read-only fresh snapshot for every participant; stale buffering leases expire; separate host buffering policy. Real-network drift and data use still need measurement. |
| Automatic call reconnect; manual override | ICE restart with bounded backoff, signaling watchdog, online recovery, restored media state. TURN provider setup and mobile call testing remain. |
| Prevent screen sleep | Best-effort wake lock during active watching/calls, visibility reacquisition. Unsupported devices cannot be guaranteed. |
| PTT for everyone with host enable/approval | Server-enforced enable, request and approval; hold-to-talk, release/blur cancellation. Browser permission testing remains. |
| Everyone sees mic/video state; host crown | Participant status icons and crown added. |
| Hall peek and Join gate | Peek inside the party hall and Join gate emoji labels. Visual polish unverified. |
| Room-size slider and internal theme UI | Capacity range; app-owned selectors replace native select popups. |
| Friend strip chat separate from room chat; add friend | Existing account messaging preserved; friend pending/accepted states corrected. Cross-room accounts need verified Supabase setup. |
| Virtual browser, Netflix, Prime, other providers | Reviewed WatchParty's cloud-browser architecture. Not implemented: requires browser workers, orchestration, authentication, provider restrictions and cost decisions. Local files/YouTube remain supported. |
| Video/chat/both at upper corner; focus in strip | Compact panel structure retained; final positioning/portrait review outstanding. |
| Xparty brand dot | Restored visible dot. |
| No external-looking dropdowns/forms | Internal listboxes; account/dialog layouts still require visual audit. |
| Fast reliable chat/call swipes | Directional pointer swipes and short transition; interactive controls excluded. Device QA outstanding. |
| Requests at chat top; last 3 expired dimmed | Pending requests at top, last 3 completed notices dimmed. |
| Screenshot call row top right near 1/2 members, 1/4 seats, auto-hide; no bottom row | Actions moved into call title row; header auto-hide/reveal. Exact small-screen layout unverified. |
| Distinct friends/participants and home/room icons | Friends icon differentiated; final icon audit outstanding. |
| One settings icon; logo goes home, no room home button | Duplicate room entry/home button hidden; logo retains home action. |
| Balanced auto-hidden top panel | Auto-hide with explicit reveal/focus; menus stay accessible. Left/right layout needs viewport audit. |
| Unexpected play/pause | Stale buffering fixed; buffering policy separated from pause-request approval. Real-device autoplay/event loop testing outstanding. |
| Google direct/OTP/other sign-in and unique IDs | Existing Supabase UUID/account integration recovered; OAuth/SMS configuration unverified. Facebook not enabled. |
| Theatre stretch portrait and landscape | Not completed; preserve aspect ratio by default, review explicit fill/crop behavior before implementation. |
| Complete non-English UI | Hindi/Kannada coverage expanded including labels/attributes; exhaustive language audit outstanding. |
| Compact panels, no gaps/overlap; borderless auto-hidden info | Compact CSS and closing info controls added; visual QA outstanding. |
| Theme label plus switch | Theme wording corrected; existing switch retained. |
| Remove useless room bell; intelligent sound notifications | Room bell hidden. Sound/volume settings redesign remains. |
| Plan volume/settings/drawers efficiently | Existing behavior retained; full sound/layout redesign outstanding. |
| Click end video cards: host plays, guest requests | Internal queue/search suggestions use existing server permissions. Native YouTube recommendations are not exposed by the player API. Browser QA outstanding. |

## Decisions and contradictions resolved

Automatic recovery is normal; force buttons retry it. Force sync does not grant guests playback control. Host-approved PTT does not bypass muted/blocked/call-seat permissions. Buffering coordination and approval of pause requests are separate settings. Cloud streaming is a separate service, not an iframe pretending to support subscription playback. User messages and usernames remain untranslated.

## Verification

`npm test`: 14 passed, 0 failed. Includes websocket admission, roles, requests, synchronization, call seats, PTT permissions, force sync timeline integrity and stale buffering recovery. `npm run check` passed. No latency benchmark or real media call test was completed. Chromium download failed; cloud browser validation was security-policy blocked. Production Hero is unchanged.

## Release gate

Before rollout: browser smoke tests, touch/swipe and viewport review, two-device video/audio/YouTube/local-file sync tests, TURN relay checks, account provider configuration, localization audit. The virtual browser and remaining sound/theatre/layout work need a subsequent implementation phase. No claim of universal zero-glitch or millisecond synchronization is made.

## Release verification update

Version 0.10.0: 15 server tests pass, including watch-only PTT requests with the four-seat limit enforced. Local Chromium smoke tests pass for joining, remembered names, crown/mic/camera status, chat delivery, internal theme choices, capacity slider, sound/display/language preferences, friend-message navigation independent of room chat, simulated YouTube drift correction, no buffering seek loops, force sync, and layouts at 320/390/844/1366 pixels. Source switches reveal playback controls and the YouTube wrapper no longer intercepts them. Pending approval cards stay above the chat scroll area.

Theatre now has Fit/Fill screen, a personal light/dark Theme switch, labeled upper-corner Video call/Chat/Both controls, with focus in the playback strip. Sound settings group playback, call and notification levels with a master notification switch. UI labels and generated internal selectors have expanded Hindi/Kannada localization; translations are not claimed exhaustive.

WebRTC offer/answer negotiation completed, but local Chromium gathered zero ICE candidates. Media transport is explicitly BLOCKED, not a passing end-to-end call test. Set XPARTY_REQUIRE_MEDIA=1 to make that block fail the smoke test in a media-capable environment. Genuine two-device/different-network media and YouTube playback tests remain necessary.

Google/OTP/cross-room accounts require Supabase/provider setup; TURN relay credentials and a cloud-browser worker service are not configured. Netflix/Prime/virtual browser are not implemented or advertised as working. The earlier draft release gate is superseded only for the interface and simulated playback checks completed above.

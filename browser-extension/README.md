# XParty Companion · Desktop preview

This optional Manifest V3 extension connects **your own** Netflix or Prime Video browser tab to an XParty room. Each participant needs access to the same title through their own subscription or purchase. The video plays on the service's official website. This extension is a preview, not a published Chrome Web Store product or an official Netflix/Amazon integration.

## Install and connect

1. Download `companion-extension.zip` from XParty and extract it.
2. On desktop Chrome open `chrome://extensions`, or on Edge open `edge://extensions`. Turn on **Developer mode**, click **Load unpacked**, and select the extracted `xparty-companion` folder containing `manifest.json`.
3. Reload your XParty room. Choose Netflix or Prime Video, paste the exact title's URL, and choose **Connect service tab**. The extension opens that title in a separate service tab.
4. Sign in directly on the service website and start the title. Keep your XParty room open. Each participant repeats this on their own desktop browser.
5. Use the room controls to coordinate playback. The host's direct Play/Pause/seek interactions on the service player are also sent through XParty's normal host and controller rules. The extension toolbar popup can disconnect the paired tab at any time.

The supported XParty addresses are `https://pkxparty.onrender.com/`, `/xparty/` on that host, `https://pkx404.github.io/xparty/`, and localhost/127.0.0.1 ports 8787, 8799 and 8801 for development. This package cannot connect arbitrary websites or arbitrary backend URLs.

Accepted Netflix links use `/watch/<id>` or `/title/<id>`. Prime Video links use `/detail/<id>`; Amazon links use `/gp/video/detail/<id>` on the explicitly listed US, UK, German, Japanese and Indian hosts. Tracking query parameters and fragments are discarded. A series page and a particular episode can have different IDs: share the episode URL that the player actually uses.

## Preview boundaries

- Netflix and Prime Video playback on their own websites is documented by their providers. Their internal player structure and behavior are not a stable public integration API. **Real signed-in provider playback has not been validated for this preview.** Standard HTML video controls may be unavailable or ignored on a provider or device.
- This preview targets ordinary ad-free, on-demand playback. Known visible advert indicators suspend sync; detection cannot establish every provider's advert state. Ad-supported subscriptions, differing adverts, live streams, trailers, automatic next episodes and different regional edits are not validated. Do not expect continuous sync in those cases. Start the same programme manually and reconnect after the advert or episode change.
- The provider page may require a direct Play click. If a different title opens, sync waits rather than controlling that title. Leaving the room, changing its source, closing either tab, or losing the room heartbeat disconnects control. The service tab stays open.
- Mobile browser extensions and XParty's Android WebView are not supported. This does not make Netflix or Prime Video render inside the XParty video area. It does not supply provider video frames for immersive backgrounds; protected content may not permit capture.
- The extension is not an account-sharing mechanism. Subscription, household, regional availability, concurrency, parental controls and service playback restrictions still apply.

## Data and permission scope

Room bearer tokens, Supabase sessions, account identities, room codes, chat, cookies and passwords are never passed to the extension. The room sends a random pairing nonce, its current opaque source ID, canonical service URL/title ID, playback time, play state and local control flags. The service content script returns only bounded playback state, player status and user playback intents.

Only one explicitly connected provider tab is controlled for each room tab. The extension service worker binds both tab IDs and document IDs, verifies exact supported origins, strips unknown protocol fields, rejects stale or mismatched source events and uses existing XParty server authorization for room changes. It has no cookie, debugger, capture, arbitrary-network or all-sites permission. Its host access is limited in the manifest; runtime checks further restrict local development origins. Pair metadata uses extension session storage and is not sent to an external server.

The provider script uses standard HTMLMediaElement play, pause, time and seekable ranges in an isolated content script. It neither extracts media URLs or pixels nor accesses DRM, licenses, service cookies, provider script internals, proprietary Xparty code or authentication forms. Browser extensions and all scripts on the trusted XParty origin still need to be trusted; the same-origin page bridge does not protect against an XParty origin compromise.

## Build and maintain

Run `node browser-extension/build.mjs` after changing `public/xparty/companion-providers.js`. This regenerates the isolated content-script protocol. `companion.mjs` builds the downloadable ZIP from a fixed file list on the server; the extension loads only packaged code.

The automated checks cover protocol validation, sender/tab/document/source binding, relay authorization boundaries, ZIP contents, and simulated video behavior. They do not establish compatibility with a signed-in Netflix/Prime account or promise provider support.

Primary references reviewed 2026-10-22:

- [Chrome content scripts and isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome message passing and security](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome extension session storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Netflix supported browsers](https://help.netflix.com/en/node/30081)
- [Prime Video system requirements for computers](https://www.primevideo.com/help?nodeId=GUX9FYHU5D8LC9EJ)

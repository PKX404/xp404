# Xparty 2.0 — Test 17 official release staging

Owner request (31 October 2026): promote the **Test 17** Android build to the official **Xparty** v2.0 app, served by https://xp404.onrender.com/, without replacing it with a newer experiment or previous main-branch interface.

## Verified Test 17 Android APK identity
- Baseline file: `XParty-1.1.2-Test-17-Xparty-PT-Public-Rooms-Install.apk`
- APK Android package/application ID: `com.pkx404.xparty.micfix`
- SHA-1 of actual APK v2 signing certificate: `6D:08:68:1B:A0:3F:45:AB:5B:4C:D5:D3:19:A7:81:50:C2:E6:2A:10`
- SHA-256 of signing certificate: `49:7A:13:0F:C6:62:14:14:EE:12:59:4B:21:8E:F5:77:FC:B9:03:AF:DA:96:74:CD:A2:AC:0B:C5:CE:7D:CA:3D`
- These fingerprints are **specific to the existing signed Test 17 APK**. Verify/re-register if the final v2.0 APK is signed with another certificate. Preserve package ID and signing identity for upgrade compatibility where possible.

## Required release work (not yet deployed)
1. Reconcile the actual Test 17 packaged front-end assets from the original APK / Test17 source ZIP into `public/xparty/`. Do not assume `main` is equal to Test 17.
2. Review all staged files against the original repository and preserve backend, room sync, media, chat, WebRTC, privacy and account features.
3. Set display label to `Xparty`, app version name to `2.0`, use unique increasing Android versionCode, and build using the intended production signing key; avoid accidentally changing the package ID.
4. Verify the Android manifest, external-browser Google sign-in, callbacks and session persistence.
5. Run tests and record Android installation, chat, video, microphone and room rejoining results; verify public room browsing.
6. Confirm the target Render workspace/service, deploy the tested release and verify /health and the live UI.
7. Do not modify the production Render deployment until the target workspace is positively confirmed and the staged Test 17 front-end is verified.

## Google Cloud client setup
- Google Cloud project: `join-xparty`, number `746110110895`.
- Android client name: `Xparty 2.0 — Test 17 signing`.
- Android package name: `com.pkx404.xparty.micfix`.
- Android SHA-1: `6D:08:68:1B:A0:3F:45:AB:5B:4C:D5:D3:19:A7:81:50:C2:E6:2A:10`.
- Separately create a **Web application** OAuth client for Supabase:
  - JavaScript origin: `https://xp404.onrender.com`
  - Google redirect URI: `https://gydhasaztdanfidrysfp.supabase.co/auth/v1/callback`
- Save the Web OAuth Client ID and Client Secret privately in Supabase Google provider settings. Never commit secrets to GitHub.
- Supabase site URL and allowlisted post-login return URL: `https://xp404.onrender.com/xparty/` (verify Android callback behavior separately).

## Deployment limitations
This branch currently contains **release staging documentation only**, based on main. It is NOT the exact Test 17 app yet and is NOT ready for promotion or deployment. Do not merge or deploy it as v2.0 until the actual Test 17 assets and corresponding Android code are integrated and validated.


## Test 17 authentication audit (31 Oct 2026)
The exact Test 17 packaged source ZIP has been inspected. `app-assets/xparty/accounts.js` already contains **`client.auth.signInWithOAuth({provider:'google',...})`** for initial Google sign-in. The separate `linkIdentity({provider:'google'})` function only connects existing users to optional YouTube/Drive permissions. Do not replace the first flow with `linkIdentity` or break the original login UI.

**Remaining external account setup:** Google Cloud project `join-xparty` already has an Android OAuth Client ID supplied by the owner (`746110110895-sadt9aqksgubn5sdnu1afq6lra2ubhha.apps.googleusercontent.com`). An Android Client ID is **not** the Web Client ID/Secret required by the hosted Supabase browser OAuth flow. The ChatGPT GitHub/Supabase connector tools here cannot create Google Cloud OAuth clients or edit Supabase Auth provider secrets.

**Required OAuth integration check:** The code deliberately opens Google OAuth in the external browser from Android WebView while storing the PKCE verifier in the WebView origin. With a redirect to the same HTTPS site in the *external* browser, the browser and WebView may not share PKCE storage. Confirm a working verified Android App Link / native callback and PKCE handoff before claiming Android users are signed in. Test on actual release APK.

**Never store the Web Client Secret or APK signing private key in frontend JavaScript, Git, ZIP shared with other users, or screenshots.**

**Confirmed**: neither the Google Cloud web OAuth client nor the full Supabase provider activation has been performed from this connected toolset; neither the official Render service nor its production frontend has been modified. Use the secure Google and Supabase dashboards for the unavailable administrative actions.

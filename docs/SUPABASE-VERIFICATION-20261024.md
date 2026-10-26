# Supabase account verification — 24 October 2026

XParty continues to use project `gydhasaztdanfidrysfp`. The unfinished Firebase Auth, Firestore, Google Play sign-in dependencies, native activities, rules and configuration were removed. Android launches the existing shared interface and uses its Supabase session. The main account screen offers email OTP (phone remains disabled by the current project). Google account sign-in was removed; the pre-existing optional signed-in library connection remains separate.

## Live inspection, without account data

All ten catalog-only statements in `accounts/inspect-existing-schema.sql` ran successfully through the Supabase connector. [Full results](schema-inspection-20261024.json) contain schema metadata only. No account rows, email addresses, messages, tokens or secret keys were read. No migration, database write, PR merge or deployment was performed.

The project is healthy and runs PostgreSQL 17.11. All six account tables exist with RLS enabled:

| Table | Existing columns | Access verified from policies and grants |
| --- | --- | --- |
| xparty_profiles | id, display_name, photo_data, bio, interests, likes, dislikes | Owner inserts/updates; owner or a connection can read. Only editable columns have UPDATE grants. |
| xparty_private_profiles | id, age | Owner-only row policy for all operations. |
| xparty_friends | id, requester, addressee, status, created_at | Participants read/delete; requester inserts pending; pending addressee accepts/declines. Only status can be updated. |
| xparty_messages | id, sender, recipient, body, created_at | Participants read; the authenticated sender can send only to an accepted friend. |
| xparty_calls | id, caller, callee, status, created_at | Participants read; accepted friends initiate; only the callee accepts. Only status can be updated. |
| xparty_signals | id, call_id, sender, recipient, payload, created_at | The recipient reads; a participant sends only within an accepted call. |

The profile redesign is **already installed**: bio is non-null text with a 240-character check; interests/likes/dislikes are non-null text arrays, each limited to eight entries and 2048 encoded bytes. Display names are 1–24 characters. The photo check permits JPEG data URLs below 100000 characters. Profile IDs reference Auth users with cascading deletion.

Friend IDs and participant foreign keys, the no-self-friend check, pending/accepted/declined statuses, and the unique unordered friend-pair index are installed. Messages have a 1–1500-character constraint and a sender/recipient/time index. All inspected constraints and indexes are valid; there are no custom account-table triggers.

`xparty_mutual_friends(target uuid)` has the expected three-column return type, empty search path, authenticated-only client execution and three accepted-connection checks. `xparty_delete_my_account()` clears the caller's sessions before deleting the Auth user. Do not rerun the older bootstrap schema over these installed functions. No additions or backfill from `redesign-migration.sql` are needed for the current profile/friend/message code.

## Findings requiring separate database review

`xparty_private_profiles` still has unnecessary anon grants and authenticated MAINTAIN/REFERENCES/TRIGGER grants inherited from defaults. Its owner-only RLS blocks anonymous row access, but grants should be narrowed in a separately reviewed hardening change. No grants were changed here.

Supabase's security advisor reports two WARN findings for the two intentional authenticated SECURITY DEFINER RPCs. Their callers, empty search paths, ownership/friend checks and EXECUTE ACLs were inspected. Any move to a private implementation with an exposed wrapper requires a separate database change; blindly switching the mutual-friend function to SECURITY INVOKER would hide the other person's graph and break its intersection. [Advisor explanation and remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Profile visibility currently includes pending and declined connections, not only accepted friends. The privacy copy now states the actual policy. Tightening visibility would be a product/database change, not part of this client fix.

## Implemented and tested

- A shared account repository validates profile, friend and message inputs, selects explicit columns, verifies returned rows, handles simultaneous first-profile creation, and discards responses after an account change.
- Profile editing includes bio/interests/likes/dislikes. Signed-in edits wait for Supabase before reporting success or updating room profile data. Failed saves keep the draft.
- Friend requests reject self-connections and malformed IDs; duplicates get an actionable message. Only incoming pending requests can be accepted. Removing a connection closes its active chat.
- Messages bind the sender to the verified account, preserve drafts on failure, prevent double submission, and render text safely. Polling preserves focus and discards stale conversations.
- Logout clears displayed profile, friend, message and provider-library data. Ending a failed private call cannot prevent logout.
- The Android debug build succeeds without Firebase. The build scripts now use Gradle for the complete native dependency set.

`npm test`: 85 passing tests, including six repository tests and an isolated Postgres RLS suite. The RLS suite reconstructs the exact inspected table/constraint/policy/grant/function definitions in ephemeral PGlite using synthetic users. It exercises allowed and denied profile writes, friend acceptance, reciprocal uniqueness, sender spoofing, stranger message access, mutual-friend scope, anonymous denial and messaging after friendship removal. It does not write to Supabase.

`tests/accounts-browser.cjs`: real pinned Supabase JS SDK against isolated Auth/REST responses; email OTP UI, profile save/failure, accepting a friend, private messaging/failure, logout cleanup, 390/1366px home layouts, no JavaScript errors. `tests/auth-browser.cjs` separately verifies protected-route restoration and logout.

`tests/local-supabase-preview.cjs`: the actual localhost site loads the real Supabase SDK and project configuration, shows signed-out email sign-in, keeps the globe and Made4Love/AANCHAL dedication, and has no page errors. No OTP was sent and no real account data was created during verification.

## Local preview and limits

Open **http://localhost:8787**. The ignored `.env.local` contains the project's public publishable key only. Restart with `node --env-file=.env.local server.mjs`. `/api/accounts/me` rejects a missing session with 401. Live Auth settings report email enabled and phone disabled. Anonymous zero-row probes of profiles/friends/messages are rejected; the private-profile zero-row request succeeds under its grants but returns no data.

Actual inbox delivery, the configured email template (numeric code versus link), and a real two-account conversation still need user-session validation. No claim is made that local tests alone establish production or deployment readiness. Android points at the deployed site, so these local web edits are not yet in the installed app's hosted interface. No Firebase setup is required.

Public library references checked: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [OTP](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [PGlite](https://pglite.dev/docs/). The current changelog's TLS cipher deprecation and PostgreSQL minor-version notices were reviewed; they do not require a change to these client account operations.

# Account authentication and protected routes

Project supplied by owner: `gydhasaztdanfidrysfp`, under PKX404. The owner confirms an account schema is already installed. Do not rerun accounts/schema.sql or apply the prepared profile migration before inspecting the live tables.

## Session boundary

GET /api/accounts/me requires an account Bearer access token. The backend verifies it against the configured Supabase /auth/v1/user endpoint using the project's public key, checks the returned authenticated identity and returns only the account UUID, email-verification state and provider names. It never authorizes a user by decoding an unverified JWT or by accepting a room resume credential. Responses are not cached; untrusted origins and unsupported methods are rejected. Verification failures return 401; configuration or provider outages return 503. No service-role key is needed.

Browser destinations #profile, #friends and #messages require server-verified sign-in before displaying account data. A destination is remembered through OTP/OAuth only from this fixed set; external URLs are not accepted as return destinations. Guest rooms and room-scoped friendships remain available separately.

Supabase Auth notifications schedule work outside the notification callback. Token refresh verifies again. Responses from earlier sessions cannot restore protected views after sign-out or an account switch. Sign-out clears account forms, friend lists, direct messages, Google provider-token storage and account profile dialogs. Guest and account profile caches are separate; signing out restores the guest profile instead of publishing the prior account's details to later guest sessions.

OTP verification uses the address and method from the code request, rather than edited form values. Email and international phone inputs are validated; duplicate submissions are disabled while pending. This does not send any real OTP during automated tests.

Profile, friend, message and call data still use the authenticated Supabase client and database RLS. Browser route guards are a display boundary; RLS remains the data authorization boundary. Its existing live configuration has not yet been inspected or certified by this work. Existing table names used by the client are unchanged.

## Inspect before migration

Run the read-only accounts/inspect-existing-schema.sql through the connected project tools. It inventories public columns, constraints, RLS policies, table/column grants, existing xparty functions and the presence of the migration ledger without selecting personal rows. Then compare actual names/types/policies with accounts/redesign-migration.sql, adapt it if necessary, apply only the compatible additive migration, and inspect the resulting schema again. Never bootstrap over an existing account schema.

Current session limitation: plugin discovery confirms Supabase is installed, but no Supabase SQL, project or migration tools are exposed to the running agent. Consequently no live tables were inspected and no migration or Auth-provider configuration was changed. A session with the connected database tools exposed is required to perform that step.

## Verification

53 Node tests pass, including account-token verification, fail-closed outage behavior, anonymous-account rejection, route allowlisting, stale-session handling, identity mismatch rejection, and the actual HTTP endpoint's origin/method/cache behavior. The Auth browser test uses a simulated Supabase SDK/Auth response with the real local verification endpoint; it confirms signed-out navigation, verified restoration and clearing private fields on sign-out with no page errors. Real OTP delivery, OAuth callbacks, live JWT validation and existing RLS still need project access and real-account validation.

Official references: https://supabase.com/docs/reference/javascript/auth-getuser and https://supabase.com/docs/reference/javascript/auth-onauthstatechange.

# Supabase inspection and deployment preflight — 2026-10-22

The eight SELECT statements from `accounts/inspect-existing-schema.sql` at PR #10 head `a60eadbd401e86b515a701e78e24cbbc6e9ef298` were run individually against `gydhasaztdanfidrysfp`. The requested signed-in browser was unavailable (empty browser inventory), so the connected Supabase tool was used. No account rows, Auth users, messages, tokens or secrets were selected. No mutation or migration was executed. The expanded local inspection script was **not** run. All catalog results are in [schema-inspection-20261022.json](schema-inspection-20261022.json).

GitHub reports PR #10 was already merged by `PKX404` at `2026-10-22T04:25:15Z`, producing main commit `bde6b62fc80e0f343149d1650100f05d2e2d6a52`. Main has the same tree as that PR head. This pass did not merge it; the new room/provider work belongs on a separate review branch.

## Compatibility with redesign-migration.sql

The migration's structural additions are already installed. No column repair is indicated by these results, and reapplying the migration is not needed to add these fields.

| Item | Observed metadata and assessment |
|---|---|
| `xparty_profiles.id` | UUID primary key; FK to auth.users ON DELETE CASCADE |
| `display_name`, `photo_data` | Text; name length 1–24; nullable JPEG data URL photo under 100000 characters |
| `bio` | Text NOT NULL, empty-string default, check length ≤240: matches migration |
| `interests`, `likes`, `dislikes` | Text arrays NOT NULL, empty-array defaults, each ≤8 entries and ≤2048 serialized bytes: match migration |
| Profile grants | Authenticated INSERT/SELECT; UPDATE only name, photo and four redesign fields, not id; no table-wide UPDATE returned |
| `xparty_friends` | UUID id/requester/addressee; text pending/accepted/declined status; created_at; no self-edge; cascading profile FKs |
| `xparty_mutual_friends(target uuid)` | TABLE(id uuid, display_name text, photo_data text); STABLE SECURITY DEFINER; empty search_path; definition matches migration's three accepted-edge checks and limit 100 |
| `xparty_private_profiles` | UUID owner id → auth.users CASCADE; nullable integer age with 18–120 check |
| `xparty_messages` | UUID id/sender/recipient; text body length 1–1500; timestamptz created_at; cascading profile FKs |
| `xparty_calls` | UUID id/caller/callee; ringing/accepted/ended status; created_at; no self-call; cascading profile FKs |
| `xparty_signals` | bigint id primary key; call_id UUID → calls CASCADE; sender/recipient UUID → profiles CASCADE; jsonb payload <65536 serialized bytes; created_at |

All six tables have RLS enabled; FORCE RLS is off. Fifteen policies were returned. Owner profile INSERT/UPDATE checks are `id=auth.uid()`. Friend UPDATE and call UPDATE are restricted to the status column. Message/call insertion requires accepted friendship; signal insertion requires an accepted call and matching participants. The deletion RPC checks auth.uid(), uses an empty search_path and deletes only that user's sessions/Auth row; its ACL was not returned.

## Required adjustment and remaining uncertainty

1. **Installed profile privacy does not match the accepted-friends claim in the UI.** `profile_read` allows the owner or any friendship edge linking the viewer to the profile. It omits `status='accepted'`, so pending and declined edges also qualify. Table-wide SELECT includes bio, interests, likes, dislikes and photo. A reviewed policy change must require an accepted edge alongside the owner branch. The redesign migration does not fix this. Pending-request names currently come from profiles: show a generic request label until acceptance, or deliberately provide a narrower identity lookup. Client-side hiding alone would not repair RLS. No policy was changed.
2. **Function permissions are not established.** The approved script returns definitions/security mode but not owners, proacl, inherited PUBLIC privileges or effective EXECUTE access. Confirm anonymous/PUBLIC execution is revoked and authenticated execution granted for the mutual-friends and deletion RPCs. The migration contains the expected mutual-friends grants, but its text does not prove the installed ACLs.
3. **Reconcile migration history rather than replaying the bootstrap.** The fields, constraints and RPC shape already match. The script establishes only that `supabase_migrations.schema_migrations` exists; it does not read entries or identify when/who applied changes.
4. **Inventory limits:** standalone indexes (including friendship pair uniqueness), triggers, function owners/ACLs, sequence privileges/identity attributes, Realtime publications, Auth provider configuration, email delivery and actual authenticated behavior were not inspected. `xparty_signals.id` has a null column_default; this query does not reveal whether it is an identity column, so that must not be reported as a missing generator. The expanded local SQL can support a separately authorized follow-up; no additional SQL was executed.
5. `xparty_private_profiles` has broad anon/authenticated table privileges but only an authenticated owner row policy. This does not establish anonymous row exposure because RLS still applies. Narrow unnecessary grants in a reviewed hardening change.

The result establishes structural compatibility of the additions, **not** safe account-profile rollout or live readiness. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) describes the separate roles of grants and row policies.

## Render branch and prepared deployment steps

No Render API/tool or signed-in browser is connected. **Render's currently configured deployment branch remains unverified.** The repository README links `https://pkxparty.onrender.com` and records `release/0.10.0` as the Render branch on 2026-10-01. That historical note is not proof of the current setting. A main-branch merge therefore does not establish that a redesign was deployed.

Before deployment, read Render **Settings → Build & Deploy** for the linked repository, branch, root directory, runtime and auto-deploy mode, then compare **Deploys → latest successful commit** with the intended commit. Do not change production settings based on an inferred branch.

- Repository `PKX404/xparty`; root `xparty-service`; Docker using the checked-in Dockerfile, or Node build `npm ci --omit=dev` and start `npm start`. Health path `/health`; listen on Render's PORT.
- Docker now includes `browser-extension/`, required for `/companion-extension.zip`. Include it in non-Docker uploads too.
- Verify ALLOWED_ORIGINS for the actual UI/backend origins, existing Supabase URL and public/publishable key, Auth redirects and TURN configuration. No secret/service-role key belongs in browser assets.
- Use a separate review service with isolated account configuration. Add only its exact reviewed hostname to the companion allowlist before testing there.
- After an approved deployment, verify the deployed commit, `/`, `/xparty/`, app/provider/room-design/immersive assets, `/companion-extension.zip` and `/health`.
- Use dedicated accounts to verify sign-in/logout, own-profile editing, stranger/pending/declined/accepted visibility, mutual-friend scope, private messages and calls. Then verify two-device playback, immersive timing and actual provider playback. Explicitly install and validate the Netflix/Prime companion with real signed-in service tabs before declaring it production-supported.

This pass performed no deployment, Render setting change, database mutation or PR merge. Local tests and simulated SDKs do not replace these checks.

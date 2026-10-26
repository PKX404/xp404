# XParty migration and Render preflight — historical, before live inspection

Superseded by [SCHEMA-RESULTS-20261022.md](SCHEMA-RESULTS-20261022.md). The statements below about PR state, missing schema results and deployment URLs reflect the earlier session, not the current verified findings.

PR #10 stays open and unmerged. No SQL has been run against project `gydhasaztdanfidrysfp`. Use `accounts/inspect-existing-schema.sql` in the Supabase SQL Editor, running each numbered statement separately. The queries read PostgreSQL catalog metadata only; they do not read profile, friend, message, Auth user, or token rows.

## What the profile change expects

The prepared `accounts/redesign-migration.sql` assumes:

- `public.xparty_profiles(id uuid, display_name text, photo_data text)` exists. The mutual-friends function selects these three columns and returns `uuid, text, text` in that order.
- `public.xparty_friends(requester uuid, addressee uuid, status text)` exists, with `status = 'accepted'` representing an accepted edge. It checks accepted edges in either direction for the viewer, requested profile and each returned mutual friend.
- `authenticated` has row-level `UPDATE` permission on its own profile through an applicable UPDATE policy, and the column grant on `bio`, `interests`, `likes`, and `dislikes` can be added. A column grant does not narrow a pre-existing table-level UPDATE grant.
- The existing `xparty_mutual_friends(uuid)` function is absent or has the same return type (`TABLE(id uuid, display_name text, photo_data text)`). `CREATE OR REPLACE` cannot change an existing function's return type.

The migration adds `bio text not null default ''` with a 240-character check and three `text[] not null default '{}'` fields, each limited to eight entries and 2048 serialized bytes. Because each `ADD COLUMN IF NOT EXISTS` skips an already-present column completely, it will not repair a pre-existing column's type, nullability, default, or missing check constraint. The catalog results must confirm those properties, or the migration must be revised before use.

The account client also relies on these tables and fields; the read-only inventory includes them so existing account routes can be checked before rollout:

| Table | Fields used by the account client |
|---|---|
| `xparty_profiles` | `id`, `display_name`, `photo_data`; after migration, `bio`, `interests`, `likes`, `dislikes` |
| `xparty_private_profiles` | `id`, `age` |
| `xparty_friends` | `id`, `requester`, `addressee`, `status` |
| `xparty_messages` | `id`, `sender`, `recipient`, `body`, `created_at` |
| `xparty_calls` | `id`, `caller`, `callee`, `status`, `created_at` |
| `xparty_signals` | `id`, `call_id`, `sender`, `recipient`, `payload` |

For the migration review, focus first on the profile and friend table columns, types, constraints and indexes; profile/friend RLS policies; table and column grants for `anon`, `authenticated`, `PUBLIC`, and `service_role`; and every existing `xparty_mutual_friends` overload, owner, security mode, settings, ACL and definition. The additional account tables' metadata helps identify unrelated installed-schema drift that could already prevent Auth routes from working.

## Security review points before approving a migration

The bootstrap schema in `accounts/schema.sql` creates a `profile_read` policy whose friendship `EXISTS` test does not require `status = 'accepted'`. If that policy exists unchanged, a pending or declined friend row can satisfy its predicate. Adding interests and dislikes to `xparty_profiles` would make those fields readable under that same policy. Confirm whether that matches the intended privacy rule; if profile details should be accepted-friends-only, revise the policy deliberately after inspecting every current policy and the client's expected profile behavior.

RLS and SQL grants both matter. Check for additional permissive policies and table-level `UPDATE` grants: an added column-level grant is additive and cannot reduce an existing table-wide grant. Review the current `xparty_mutual_friends` function before replacing it, because it runs as `SECURITY DEFINER` in the prepared migration. Its owner, `search_path`, ACL and function body must be checked together with the accepted-friend conditions. The read-only script returns all of those metadata without executing the function.

No live schema results are available to this session, so compatibility with the actual installed project is not yet established. The query results are the remaining input needed to adapt the migration safely.

## Render deployment branch and prepared steps

The Render dashboard/API is not connected to this session, so I cannot read the service's configured repository, branch, root directory, auto-deploy mode, or current deployment. The repository snapshot contains a Dockerfile under `xparty-service`, but no `render.yaml`/Render Blueprint file. The README's claim that a Render blueprint is supplied is stale. The known live URLs are `https://pkx404-xparty.onrender.com` for the existing room service and `https://xparty-wsev.onrender.com` for an additional frontend; the source docs say both frontends use the existing room backend. These URLs do not reveal which Git branch Render deploys.

Keep the existing production service untouched while PR #10 remains unmerged. In the Render Dashboard, open the service that owns `pkx404-xparty.onrender.com` and read **Settings → Build & Deploy**: linked repository, branch, root directory, runtime, build/start commands, and Auto-Deploy setting. Also check the latest successful deployment's commit on **Deploys**. Repeat for `xparty-wsev` only if that frontend is intended to ship these assets independently.

If a review deployment is desired before merge, create a separate Render web service from `PKX404/xparty`, branch `feat/immersive-social-redesign`, root directory `xparty-service`, using the checked-in Dockerfile. Keep production environment variables and production data isolated. Do not put a service-role/secret key in the browser or copy production credentials into a preview. The Dockerfile runs `npm ci --omit=dev` and `node server.mjs`; `/health` is the health-check path. If configuring a native Node service instead of Docker, use build `npm ci --omit=dev` and start `npm start` from `xparty-service`.

For production, after schema review and explicit merge approval, confirm the linked production branch is `main` and note whether Auto-Deploy is `On Commit`, `After CI Checks Pass`, or `Off`. GitHub reports no CI check runs on the PR head, so an `After CI Checks Pass` service may wait until checks are configured/passing. Merge only after the database and account configuration gates are satisfied, then follow the Render Deploys page through a successful build. Verify `GET /health`, `/xparty/`, `/xparty/accounts.js`, `/xparty/account-gate.js`, and `/xparty/immersive.js` on the deployed host and inspect the deployed commit SHA. Do not treat the local 53-test pass as database, OAuth, provider or live deployment validation.

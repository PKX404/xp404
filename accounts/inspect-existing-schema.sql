-- READ ONLY: run these statements one at a time in Supabase SQL Editor.
-- Project: gydhasaztdanfidrysfp. They inspect catalog metadata only; no account rows,
-- auth.users records, emails, messages, tokens, or secrets are selected or changed.

-- 1. Confirm the account tables exist and inspect RLS state.
with required(table_name, migration_relevant) as (
  values
    ('xparty_profiles', true),
    ('xparty_friends', true),
    ('xparty_private_profiles', false),
    ('xparty_messages', false),
    ('xparty_calls', false),
    ('xparty_signals', false)
)
select r.table_name, r.migration_relevant,
       c.relkind,
       coalesce(c.relrowsecurity, false) as rls_enabled,
       coalesce(c.relforcerowsecurity, false) as rls_forced
from required r
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
order by r.migration_relevant desc, r.table_name;

-- 2. Exact columns, types, nullability, defaults and identity/generated behavior.
select table_name, ordinal_position, column_name, data_type, udt_schema, udt_name,
       is_nullable, column_default, is_identity, identity_generation,
       is_generated, generation_expression, character_maximum_length
from information_schema.columns
where table_schema = 'public'
  and table_name in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                     'xparty_messages','xparty_calls','xparty_signals')
order by table_name, ordinal_position;

-- 3. Constraints and referenced tables. Definitions are schema text, not row data.
select tbl.relname as table_name, con.conname as constraint_name,
       case con.contype
         when 'p' then 'primary key'
         when 'f' then 'foreign key'
         when 'u' then 'unique'
         when 'c' then 'check'
         when 'x' then 'exclusion'
         else con.contype::text
       end as constraint_type,
       con.convalidated as validated,
       con.condeferrable as deferrable,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace n on n.oid = tbl.relnamespace
where n.nspname = 'public'
  and tbl.relname in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                      'xparty_messages','xparty_calls','xparty_signals')
order by tbl.relname, con.contype, con.conname;

-- 4. RLS policies, including their role, command, USING and WITH CHECK expressions.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                    'xparty_messages','xparty_calls','xparty_signals')
order by tablename, policyname;

-- 5. Table-level privileges for PUBLIC, anon, authenticated and service_role.
select tbl.relname as table_name,
       case acl.grantee when 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
       acl.privilege_type, acl.is_grantable
from pg_class tbl
join pg_namespace n on n.oid = tbl.relnamespace
cross join lateral aclexplode(coalesce(tbl.relacl, acldefault('r', tbl.relowner))) acl
where n.nspname = 'public'
  and tbl.relname in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                      'xparty_messages','xparty_calls','xparty_signals')
  and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon','authenticated','service_role'))
order by tbl.relname, grantee, acl.privilege_type;

-- 6. Column-level grants. Table-level grants are reported separately above.
select table_name, column_name, grantee, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                     'xparty_messages','xparty_calls','xparty_signals')
  and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_name, column_name, grantee, privilege_type;

-- 7. Indexes, especially the unordered friend-pair uniqueness rule.
select tbl.relname as table_name, idx.relname as index_name,
       i.indisprimary as is_primary, i.indisunique as is_unique,
       i.indisvalid as is_valid, pg_get_indexdef(i.indexrelid) as definition
from pg_index i
join pg_class tbl on tbl.oid = i.indrelid
join pg_class idx on idx.oid = i.indexrelid
join pg_namespace n on n.oid = tbl.relnamespace
where n.nspname = 'public'
  and tbl.relname in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                      'xparty_messages','xparty_calls','xparty_signals')
order by tbl.relname, idx.relname;

-- 8. Existing XParty function signatures, owners, security mode, search_path, ACL and body.
-- This detects a return-type conflict before CREATE OR REPLACE is considered.
select p.oid::regprocedure::text as signature,
       pg_get_function_arguments(p.oid) as arguments_with_names,
       pg_get_function_result(p.oid) as return_type,
       pg_get_userbyid(p.proowner) as owner,
       l.lanname as language,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig as function_settings,
       coalesce(p.proacl::text, '(default ACL)') as acl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in ('xparty_mutual_friends','xparty_delete_my_account')
order by p.proname, p.oid::regprocedure::text;

-- 9. Triggers on account tables, in case they change profile/friend writes.
select tbl.relname as table_name, trg.tgname as trigger_name,
       pg_get_triggerdef(trg.oid, true) as definition,
       fn.oid::regprocedure::text as function_signature,
       pg_get_functiondef(fn.oid) as function_definition
from pg_trigger trg
join pg_class tbl on tbl.oid = trg.tgrelid
join pg_namespace n on n.oid = tbl.relnamespace
join pg_proc fn on fn.oid = trg.tgfoid
where n.nspname = 'public'
  and not trg.tgisinternal
  and tbl.relname in ('xparty_profiles','xparty_friends','xparty_private_profiles',
                      'xparty_messages','xparty_calls','xparty_signals')
order by tbl.relname, trg.tgname;

-- 10. Migration-ledger presence only; no ledger rows or migration names are returned.
select to_regclass('supabase_migrations.schema_migrations') is not null
       as supabase_migration_ledger_exists;

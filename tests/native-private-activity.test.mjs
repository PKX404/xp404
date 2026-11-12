import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('private device snapshots are idempotent, isolated by account and revocable', async t=>{
  const db=await PGlite.create();
  t.after(()=>db.close());
  const a='16111111-1111-4111-8111-111111111111', b='26222222-2222-4222-8222-222222222222',device='36333333-3333-4333-8333-333333333333';
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select current_setting('app.uid')::uuid$$;
    grant usage on schema auth to authenticated; insert into auth.users values('${a}'),('${b}');`);
  await db.exec(await readFile(new URL('../accounts/native-private-activity.sql',import.meta.url),'utf8'));
  await db.exec(`set role authenticated;set app.uid='${a}';`);
  for(const count of [1,2])await db.query('select public.xparty_save_device_activity($1,$2)',[device,JSON.stringify({count})]);
  assert.deepEqual((await db.query('select snapshot from public.xparty_device_activity')).rows,[{snapshot:{count:2}}]);
  await db.exec(`set app.uid='${b}';`);
  assert.equal((await db.query('select count(*)::int as n from public.xparty_device_activity')).rows[0].n,0);
  await assert.rejects(db.query('insert into public.xparty_device_activity values($1,$2,$3)',[a,b,'{}']));
  await db.exec(`set app.uid='${a}';delete from public.xparty_device_activity;`);
  assert.equal((await db.query('select * from public.xparty_device_activity')).rows.length,0);
});

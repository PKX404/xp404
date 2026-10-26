import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Replay catalog definitions in an ephemeral Postgres engine. No network, real
// users, live writes, or Supabase service-role credentials are involved.
const snapshot=JSON.parse(await readFile(new URL('../docs/schema-inspection-20261024.json',import.meta.url),'utf8'));
const rows=n=>snapshot.results.find(r=>r.statement===n).rows;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
test('inspected Supabase schema enforces profile ownership, reciprocal friends and private messages',async t=>{
 const db=await PGlite.create();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create table auth.sessions(user_id uuid);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const table of rows(1)){
  const columns=rows(2).filter(c=>c.table_name===table.table_name).map(c=>quote(c.column_name)+' '+(c.udt_name==='_text'?'text[]':c.data_type)+(c.is_identity==='YES'?' generated always as identity':c.column_default?' default '+c.column_default:'')+(c.is_nullable==='NO'?' not null':''));
  await db.exec(`create table public.${quote(table.table_name)} (${columns.join(',')});${table.rls_enabled?'alter table public.'+quote(table.table_name)+' enable row level security;':''}`);
 }
 for(const c of rows(3).filter(c=>c.constraint_type==='primary key'))await db.exec(`alter table public.${quote(c.table_name)} add constraint ${quote(c.constraint_name)} ${c.definition}`);
 for(const c of rows(3).filter(c=>c.constraint_type!=='primary key'))await db.exec(`alter table public.${quote(c.table_name)} add constraint ${quote(c.constraint_name)} ${c.definition}`);
 for(const i of rows(7).filter(i=>!i.is_primary))await db.exec(i.definition);
 for(const p of rows(4))await db.exec(`create policy ${quote(p.policyname)} on public.${quote(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.slice(1,-1).split(',').map(quote).join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`);
 for(const g of rows(5))await db.exec(`grant ${g.privilege_type} on public.${quote(g.table_name)} to ${g.grantee==='PUBLIC'?'public':quote(g.grantee)}`);
 for(const g of rows(6).filter(g=>g.grantee==='authenticated'))await db.exec(`grant ${g.privilege_type} (${quote(g.column_name)}) on public.${quote(g.table_name)} to authenticated`);
 for(const f of rows(8)){await db.exec(f.definition);await db.exec(`revoke all on function public.${f.signature} from public,anon;grant execute on function public.${f.signature} to authenticated`);}
 const ids=Array.from({length:4},(_,i)=>`10000000-0000-4000-8000-00000000000${i+1}`),[a,b,c,d]=ids;
 for(const id of ids){await db.query('insert into auth.users values ($1)',[id]);await db.query('insert into xparty_profiles(id,display_name) values ($1,$2)',[id,'Fixture '+id.slice(-1)]);}
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 await as(a);assert.equal((await db.query('select id from xparty_profiles')).rows.length,1);
 await db.query("update xparty_profiles set bio='Movie nights',interests=ARRAY['Cinema'] where id=$1",[a]);
 assert.equal((await db.query("update xparty_profiles set bio='wrong' where id=$1 returning id",[b])).rows.length,0);
 await assert.rejects(db.query('update xparty_profiles set id=$1 where id=$2',[b,a]),e=>e.code==='42501');
 await assert.rejects(db.query('insert into xparty_messages(sender,recipient,body) values($1,$2,$3)',[a,b,'Before friendship']),e=>e.code==='42501');
 const request=(await db.query('insert into xparty_friends(requester,addressee) values($1,$2) returning id',[a,b])).rows[0].id;
 assert.equal((await db.query("update xparty_friends set status='accepted' where id=$1 returning id",[request])).rows.length,0);
 await as(b);await assert.rejects(db.query('insert into xparty_friends(requester,addressee) values($1,$2)',[b,a]),e=>e.code==='23505');
 assert.equal((await db.query("update xparty_friends set status='accepted' where id=$1 returning id",[request])).rows.length,1);
 await assert.rejects(db.query('insert into xparty_messages(sender,recipient,body) values($1,$2,$3)',[a,b,'Spoofed sender']),e=>e.code==='42501');
 await db.query('insert into xparty_messages(sender,recipient,body) values($1,$2,$3)',[b,a,'Private fixture message']);
 await as(a);assert.equal((await db.query('select body from xparty_messages')).rows.length,1);
 await db.query('insert into xparty_private_profiles(id,age) values($1,25)',[a]);
 await as(c);assert.equal((await db.query('select body from xparty_messages')).rows.length,0);assert.equal((await db.query('select age from xparty_private_profiles')).rows.length,0);
 assert.equal((await db.query('select * from xparty_mutual_friends($1)',[a])).rows.length,0);
 await db.exec('reset role');for(const [x,y]of [[a,c],[b,c],[a,d]])await db.query("insert into xparty_friends(requester,addressee,status) values($1,$2,'accepted')",[x,y]);
 await as(a);assert.deepEqual((await db.query('select id from xparty_mutual_friends($1)',[b])).rows.map(r=>r.id),[c]);
 await as(null,'anon');assert.equal((await db.query('select age from xparty_private_profiles')).rows.length,0);
 await assert.rejects(db.query('select * from xparty_messages'),e=>e.code==='42501');await assert.rejects(db.query('select * from xparty_mutual_friends($1)',[a]),e=>e.code==='42501');
 await as(a);await db.query('delete from xparty_friends where id=$1',[request]);await assert.rejects(db.query('insert into xparty_messages(sender,recipient,body) values($1,$2,$3)',[a,b,'Removed']),e=>e.code==='42501');
});

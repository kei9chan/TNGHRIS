import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private;
create table public.hris_users(id uuid primary key,email text,status text,role text);
create table public.roles(id text primary key,is_active boolean);
create table public.user_roles(user_id uuid,role_id text,is_active boolean);
create table public.job_offers(id uuid primary key,status text,offer_number text,signature_name text);
create table public.notifications(user_id uuid,type text,title text,message text,link text,related_entity_id uuid);
insert into roles values ('HR Staff',true),('HR Manager',true);
insert into hris_users values
('00000000-0000-4000-8000-000000000001','hr1@example.test','Active','HR Manager'),
('00000000-0000-4000-8000-000000000002','hr2@example.test','Active','Employee'),
('00000000-0000-4000-8000-000000000003','other@example.test','Active','Employee'),
('00000000-0000-4000-8000-000000000004','inactive@example.test','Inactive','HR Staff');
insert into user_roles values ('00000000-0000-4000-8000-000000000002','HR Staff',true);
insert into job_offers values ('00000000-0000-4000-8000-000000000010','Sent','EXAMPLE','Sample Candidate');`);
const sql = await readFile(new URL('../supabase/migrations/20261006063323_offers_read_and_acceptance_notifications.sql',import.meta.url),'utf8');
await db.exec(sql.slice(sql.indexOf('create table public.offer_acceptance_email_queue')));
await db.exec(`update job_offers set status='Accepted and Signed';`);
assert.equal((await db.query('select count(*)::int as n from offer_acceptance_email_queue')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n,2);
await db.exec(`update job_offers set status='Accepted and Signed';`);
assert.equal((await db.query('select count(*)::int as n from notifications')).rows[0].n,2,'Duplicate updates must not renotify');
for (const role of ['anon','authenticated']) {
 assert.equal((await db.query(`select has_table_privilege('${role}','offer_acceptance_email_queue','select') as allowed`)).rows[0].allowed,false);
}
await db.close();
console.log('Offer HR notification tests passed: primary/secondary HR roles, inactive/non-HR exclusion, deduplication, private queue.');

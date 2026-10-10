import fs from 'node:fs';import {createEventFixture,id} from './operationsEventFixture.mjs';export {id};
export const phoneMigration='supabase/migrations/20261010212044_hris_phone_push_installation.sql';
export const signingSecret='fixture-only-signing-secret';
export async function createPhoneFixture(dir){
 const db=await createEventFixture(dir);
 await db.exec(`create schema vault;create schema extensions;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table auth.sessions(id uuid primary key,user_id uuid);
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',nullif(current_setting('test.session',true),''))$$;
 create table private.test_hmac(input bytea,key bytea,result bytea,primary key(input,key));
 -- PGlite has no pgcrypto extension. Protocol integration checks real HMAC against live Postgres as well.
 create function extensions.hmac(input bytea,key bytea,algorithm text) returns bytea language sql stable as $$select coalesce((select result from private.test_hmac h where h.input=$1 and h.key=$2),decode('00','hex'))$$;
 insert into vault.decrypted_secrets values('tng_phone_push_signing','${signingSecret}');
 insert into auth.sessions values('${id(113)}','${id(13)}'),('${id(114)}','${id(14)}'),('${id(111)}','${id(11)}');`);
 await db.exec(fs.readFileSync(phoneMigration,'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261011003000_phone_push_safe_health_updates.sql','utf8'));
 await db.exec("update phone_push_private.configuration set enabled=true,public_key='fixture-public-key';");return db;
}

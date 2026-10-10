import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {createAssetMaintenanceFixture,id} from './assetMaintenanceFixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tng-assets-maint-'));let db=await createAssetMaintenanceFixture(dir);
const actor=async n=>db.exec(`reset role;set test.actor='${id(n)}';set role authenticated`);
const workspace=async (n=1)=>(await db.query('select ops_workspace($1) w',[id(n)])).rows[0].w;
const save=async(asset,title='Clean freezer')=>(await db.query("select ops_save_template(null,$1,'task',$2,null,true) id",[id(1),{title,asset_id:asset}])).rows[0].id;
const rejected=async action=>assert.rejects(action,/(Requires maintenance|library|permission|row-level security|Access denied|workspace|not authorized)/i);
try{
 await actor(10);assert.equal((await db.query('select requires_maintenance from assets where id=$1',[id(51)])).rows[0].requires_maintenance,false);
 const row={asset_tag:'FREEZER-A',name:'Bar freezer',type:'Equipment',business_unit_id:id(1),purchase_date:'2026-10-10',requires_maintenance:true};
 const result=(await db.query('select import_assets_batch($1) r',[[row,{...row,asset_tag:'FREEZER-B',name:'Kitchen freezer',business_unit_id:id(2)},{...row,asset_tag:'LEGACY',name:'Legacy import',requires_maintenance:undefined}]])).rows[0].r;assert.equal(result.imported_rows,3);
 const freezer=(await db.query('select id from assets where asset_tag=$1',['FREEZER-A'])).rows[0].id;
 await actor(11);assert.deepEqual((await workspace()).assets.map(a=>a.name),['Bar freezer']);await rejected(()=>save(id(51)));const foreign=(await db.query('select id from assets where asset_tag=$1',['FREEZER-B'])).rows[0].id;await rejected(()=>save(foreign));await rejected(()=>workspace(2));
 const template=await save(freezer);const version=(await workspace()).templates.find(t=>t.id===template).versions[0].id;
 await db.query('select ops_assign($1,$2,$3,$4,$5,$6,$7,$8)',[id(1),version,{mode:'individual',ids:[id(13)],phase:'2'},new Date(Date.now()+86400000).toISOString(),'Normal','Follow the manual',[],false]);
 await db.query('select ops_delegate($1,$2,false,true)',[id(1),id(15)]);await actor(15);assert.deepEqual((await workspace()).assets.map(a=>a.name),['Bar freezer']);await rejected(()=>save(freezer));
 await actor(13);assert.deepEqual((await workspace()).assets,[]);await rejected(()=>save(freezer));assert.equal((await db.query('update assets set requires_maintenance=false where id=$1 returning id',[freezer])).rows.length,0);await rejected(()=>db.query('select import_assets_batch($1)',[[row]]));
 await actor(16);assert.deepEqual((await workspace(2)).assets.map(a=>a.name),['Kitchen freezer']);
 await actor(10);await db.query('update assets set requires_maintenance=false where id=$1',[freezer]);assert.deepEqual((await workspace()).assets,[]);await rejected(()=>save(freezer));assert.equal((await workspace()).assignments[0].content.asset_id,freezer);await db.query('update assets set requires_maintenance=true,business_unit_id=$2 where id=$1',[freezer,id(2)]);assert.deepEqual((await workspace()).assets,[]);assert.equal((await workspace(2)).assets.length,2);await rejected(()=>save(freezer));
 await assert.rejects(()=>db.query('select import_assets_batch($1)',[[{...row,asset_tag:'BAD',requires_maintenance:'yes'}]]),/boolean/);assert.equal((await db.query("select count(*)::int n from assets where asset_tag='BAD'")).rows[0].n,0);
 await db.close();db=new PGlite(dir);await actor(10);assert.equal((await workspace(2)).assets.length,2);assert.equal((await workspace()).assignments[0].content.asset_id,freezer);console.log('Asset maintenance database passed: default false, Equipment type, import flag, invalid flag rollback, unit isolation, multi-unit manager, employee mutation denial, linked task assignment, opt-out and transfer, immutable history, persistence after database reopen.');
}finally{await db.close();fs.rmSync(dir,{recursive:true,force:true});}

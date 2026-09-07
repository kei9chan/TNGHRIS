import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'offer-charge-'));
try {
 await build({entryPoints:['components/recruitment/serviceChargeTerms.ts'],bundle:true,format:'esm',platform:'node',outfile:join(dir,'terms.mjs')});
 const {offerServiceChargeTerms:terms}=await import(join(dir,'terms.mjs'));
 assert.deepEqual(terms(),[]);assert.deepEqual(terms({commissionOrIncentive:'Sales commission only'}),[]);
 const condition='Service charge as slated by the management, shall be exclusive to brand currently being handled and shall be removed when no longer applicable.';
 assert.deepEqual(terms({commissionOrIncentive:condition}),[condition]);
 assert.deepEqual(terms({benefits:[{name:'Service charge',included:false,value:'1000'}]}),[]);
 assert.match(terms({benefits:[{name:'Service charge',included:true,value:'Variable',eligibility:'Upon regularization'}]})[0],/Variable.*Upon regularization/);
 assert.match(terms({allowances:[{name:'Service Charge',amount:1200,guaranteed:false}]})[0],/1,200.*Estimated/);
 console.log('Service charge conditional display and saved terms tests passed');
} finally {await rm(dir,{recursive:true,force:true});}

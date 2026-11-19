import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';

const db = new PGlite();
const source = 'supabase/migrations/20261119044248_hiring_engagement_types.sql';
try {
  await db.exec(`
    create type job_employment_type as enum('Full-Time','Part-Time','Contract');
    create table job_requisitions(id int generated always as identity, employment_type job_employment_type not null);
    insert into job_requisitions(employment_type) values ('Full-Time'),('Part-Time'),('Contract');
  `);
  await db.exec(await readFile(source,'utf8'));
  for(const months of [1,3,5,12]) {
    await db.query("insert into job_requisitions(employment_type,seasonal_months) values('Seasonal',$1)",[months]);
  }
  for(const months of [null,0,-1]) {
    await assert.rejects(db.query("insert into job_requisitions(employment_type,seasonal_months) values('Seasonal',$1)",[months]),{code:'23514'});
  }
  await assert.rejects(db.query("insert into job_requisitions(employment_type,seasonal_months) values('Seasonal',$1)",['3.5']),{code:'22P02'});
  await db.exec("insert into job_requisitions(employment_type) values('Weekender')");
  await assert.rejects(db.query("insert into job_requisitions(employment_type,seasonal_months) values('Weekender',3)"),{code:'23514'});
  assert.equal((await db.query("select count(*)::int n from job_requisitions where employment_type::text in ('Full-Time','Part-Time','Contract') and seasonal_months is null")).rows[0].n,3);

  const bundle = async (file,stub=false) => {
    const r = await build({entryPoints:[file],bundle:true,write:false,platform:'node',format:'esm',plugins:stub?[{
      name:'fake-database',
      setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'fake',namespace:'test'}));
        b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`
          let result;
          export const supabase={from:()=>({
            insert(value){result={id:'test-requisition',...value};return this},
            update(value){result={id:'test-requisition',...value};return this},
            eq(){return this},select(){return this},
            single(){return Promise.resolve({data:result,error:null})}
          })};
        `,loader:'js'}));}
    }]:[]});
    return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
  };
  const helper=await bundle('utils/hiringEmployment.ts');
  assert.ok(helper.HIRING_EMPLOYMENT_TYPES.includes('Weekender'));
  assert.equal(helper.hiringEmploymentLabel({employmentType:'Seasonal',seasonalMonths:3}),'Seasonal (3 months)');
  assert.equal(helper.hiringEmploymentLabel({employmentType:'Seasonal',seasonalMonths:1}),'Seasonal (1 month)');
  assert.ok(helper.seasonalMonthsError('Seasonal',3.5));
  const service=await bundle('services/jobRequisitionService.ts',true);
  for (const months of [3,5]) {
    const result=await service.saveJobRequisition({employmentType:'Seasonal',seasonalMonths:months});
    assert.equal(result.employmentType,'Seasonal');
    assert.equal(result.seasonalMonths,months);
  }
  await assert.rejects(service.saveJobRequisition({employmentType:'Seasonal'}),/positive whole number/);
  await assert.rejects(service.saveJobRequisition({employmentType:'Seasonal',seasonalMonths:2.5}),/positive whole number/);
  const weekender=await service.saveJobRequisition({id:'test-requisition',employmentType:'Weekender',seasonalMonths:3});
  assert.equal(weekender.employmentType,'Weekender');
  assert.equal(weekender.seasonalMonths,undefined);
  const legacyService=await bundle('services/recruitmentService.ts',true);
  assert.equal((await legacyService.saveJobRequisition({employmentType:'Seasonal',seasonalMonths:5})).seasonalMonths,5);
  const employment=await bundle('components/recruitment/offerEmployment.ts');
  assert.equal(employment.normalizeOfferEmploymentType('Seasonal').type,'Seasonal / Fixed-Term');
  assert.deepEqual(employment.normalizeOfferEmploymentType('Weekender'),{type:'Custom',customName:'Weekender'});
  console.log('Seasonal hiring: 3/5-month persistence, required whole months, clearing stale duration, enum compatibility, recruitment labels and offer type carry-through passed');
} finally { await db.close(); }

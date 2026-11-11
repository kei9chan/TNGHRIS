import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';

// Exercise the actual client paging and mapping against a simulated API cap.
const total=1208;
const rows=Array.from({length:total},(_,i)=>{
  const id=String(i+1).padStart(6,'0');
  return {id,candidate_id:id,first_name:'Fixture',last_name:id,email:'fixture@example.test',source:'Career Site',stage:'New',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',resume_url:`resumes/${id}.pdf`};
});
let failNextPage=false;
globalThis.atsFixture={from(){
  let cursor='',limit=1000;
  const query={select:()=>query,order(key){assert.equal(key,'id');return query;},limit(value){limit=value;return query;},gt(key,value){assert.equal(key,'id');cursor=value;return query;},then(resolve){resolve(failNextPage&&cursor?{data:null,error:{message:'network unavailable'}}:{data:rows.filter(row=>row.id>cursor).slice(0,Math.min(limit,350)),error:null});}};
  return query;
}};
const bundle=await build({stdin:{contents:`export {fetchCandidates,fetchApplications} from './services/recruitmentService'; export {careerSourceSlug} from './services/recruitmentRows'; export {applicantDocumentLinks} from './services/applicantDocuments'; export {getApplicationPath,isJobCurrentlyOpen,mapPublicJobPost} from './services/publicCareersService';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'mock-supabase',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase = globalThis.atsFixture;',loader:'js'}));}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const [candidates,applications]=await Promise.all([api.fetchCandidates(),api.fetchApplications()]);
assert.equal(candidates.length,total);assert.equal(applications.length,total);
const byId=new Map(candidates.map(c=>[c.id,c]));assert.ok(applications.every(a=>byId.get(a.candidateId)?.firstName==='Fixture'));
assert.equal(applications.find(a=>a.id==='001208').resumeUrl,'resumes/001208.pdf');
failNextPage=true;await assert.rejects(api.fetchApplications(),/network unavailable/);failNextPage=false;
assert.equal(api.careerSourceSlug('/careers/Fixture%20Brand/apply/some-role?roleId=sample'),'Fixture Brand');
assert.equal(api.careerSourceSlug('/careers/Fixture/apply'),'Fixture');
assert.equal(api.careerSourceSlug('https://unknown.test/careers/Fixture/apply'),undefined);
const publicUrl=path=>`https://files.example.test/recruitment-uploads/${encodeURI(path)}`;
const docs=api.applicantDocumentLinks([{resumeUrl:'resumes/old file.pdf',resumeLink:'https://example.test/cv',resumeFilePath:'resumes/public/new.pdf',resumeFileUrl:publicUrl('resumes/public/new.pdf')}], 'https://example.test/portfolio','javascript:alert(1)',publicUrl);
assert.deepEqual(docs.map(d=>d.url),[publicUrl('resumes/public/new.pdf'),'https://example.test/cv',publicUrl('resumes/old file.pdf'),'https://example.test/portfolio']);
assert.equal(api.applicantDocumentLinks([{resumeUrl:'resumes/../unsafe.pdf'}],undefined,undefined,publicUrl).length,0);
const role=api.mapPublicJobPost({id:'role-id',slug:'graphic-artist',status:'Published',channels:{careerSite:true}});
assert.equal(api.getApplicationPath('Fixture Brand',role,'jobs'),'/careers/Fixture%20Brand/apply/graphic-artist?roleId=role-id&openRoles=jobs');
assert.equal(api.isJobCurrentlyOpen({...role,channels:{careerSite:false}}),false);

// Run the shipped public submission function against isolated database fixtures.
// No production candidate, upload, email or application is created.
const db=new PGlite();
try {
await db.exec(`
create role anon; create role authenticated;
create table public.applicant_page_themes(id uuid primary key default gen_random_uuid(),slug text unique,business_unit_id uuid,is_active boolean);
create table public.job_posts(id uuid primary key default gen_random_uuid(),business_unit_id uuid,requisition_id uuid,slug text,title text,department_label text,location_label text,employment_type text,role_details jsonb,status text,is_active boolean,is_archived boolean,channels jsonb,application_open_at timestamptz,application_close_at timestamptz);
create table public.job_candidates(id uuid primary key default gen_random_uuid(),first_name text,last_name text,email text,phone text,source text,portfolio_url text,consent_at timestamptz,current_city text,linkedin_url text,current_employer text,earliest_start_date date);
create table public.job_applications(id uuid primary key default gen_random_uuid(),candidate_id uuid not null references public.job_candidates,job_post_id uuid references public.job_posts,requisition_id uuid,role_id text,role_slug text,role_title_snapshot text,department_snapshot text,location_snapshot text,employment_type_snapshot text,work_arrangement_snapshot text,stage text,resume_url text,resume_link text,resume_file_url text,resume_file_path text,role_answers jsonb,source_application_page text,application_reference text,submission_token text unique);
alter table public.applicant_page_themes enable row level security;
alter table public.job_posts enable row level security;
alter table public.job_candidates enable row level security;
alter table public.job_applications enable row level security;
`);
await db.exec(await readFile(new URL('../supabase/migrations/20260911080000_public_careers_access.sql',import.meta.url),'utf8'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const unitCounts=[0,2,3,1,2,5,1];
const roles=[];
for(const [unit,count] of unitCounts.entries()){
 const slug=`Fixture-Unit-${unit}`;
 await db.query('insert into applicant_page_themes(slug,business_unit_id,is_active) values($1,$2,true)',[slug,uuid(unit+1)]);
 for(let j=0;j<count;j++){
  const id=uuid(100+roles.length);roles.push({id,slug});
  await db.query(`insert into job_posts(id,business_unit_id,requisition_id,slug,title,status,is_active,is_archived,channels) values($1,$2,$3,$4,'Fixture Role','Published',true,false,'{"careerSite":true}')`,[id,uuid(unit+1),uuid(200+unit),`role-${j}`]);
 }
}
const payload={first_name:'Fixture',last_name:'Applicant',email:'fixture@example.test',phone:'0000000000',portfolio_url:'https://example.test/portfolio'};
const file={consent:true,resume_file_path:'resumes/public/fixture.pdf',resume_file_url:'https://files.example.test/resume.pdf',resume_url:'https://files.example.test/resume.pdf',role_answers:{experience:'Fixture answer'}};
const link={consent:true,resume_link:'https://example.test/cv',resume_url:'https://example.test/cv'};
const submit=async(slug,job,token,attachment=file,candidate=payload)=>{
 await db.exec('set role anon');
 try {return (await db.query('select public.submit_public_career_application($1,$2,$3,$4,$5) as result',[slug,job,token,JSON.stringify(candidate),JSON.stringify(attachment)])).rows[0].result;}
 finally {await db.exec('reset role');}
};
for(let i=0;i<unitCounts.length;i++) assert.equal((await submit(`Fixture-Unit-${i}`,null,uuid(300+i),link)).reference,`APP-${uuid(300+i).replaceAll('-','').toUpperCase()}`);
for(const [i,job] of roles.entries()) assert.equal((await submit(job.slug,job.id,uuid(400+i))).reference,`APP-${uuid(400+i).replaceAll('-','').toUpperCase()}`);
assert.equal((await submit(roles[0].slug,roles[0].id,uuid(400))).reference,`APP-${uuid(400).replaceAll('-','').toUpperCase()}`);
assert.equal((await db.query(`select count(*)::int n from job_applications a join job_candidates c on c.id=a.candidate_id where c.first_name='Fixture' and a.application_reference is not null and (a.resume_file_path is not null or a.resume_link is not null)`)).rows[0].n,21);
assert.equal((await db.query(`select count(*)::int n from job_candidates`)).rows[0].n,21,'A retry creates no duplicate candidate');
assert.equal((await db.query(`select count(*)::int n from job_applications a join applicant_page_themes t on t.slug=split_part(a.source_application_page,'/',3) where a.job_post_id is null`)).rows[0].n,7);
await assert.rejects(submit('Fixture-Unit-0',roles[0].id,uuid(500)),/no longer accepting/);
await assert.rejects(submit(roles[0].slug,roles[0].id,uuid(400),file,{...payload,email:'different@example.test'}),/token is already in use/);
await assert.rejects(submit('missing-form',null,uuid(501)),/not accepting/);
await assert.rejects(submit(roles[0].slug,roles[0].id,uuid(502),{...file,consent:false}),/privacy consent/);
await db.query(`update job_posts set application_close_at=now()-interval '1 day' where id=$1`,[roles[0].id]);
await assert.rejects(submit(roles[0].slug,roles[0].id,uuid(503)),/no longer accepting/);
await db.exec(`alter table job_applications add constraint test_submission_write_failure check(submission_token <> '${uuid(504)}')`);
await assert.rejects(submit('Fixture-Unit-0',null,uuid(504),link),/test_submission_write_failure/);
assert.equal((await db.query('select count(*)::int n from job_candidates')).rows[0].n,21,'An application insert failure rolls back its candidate');
await db.exec('set role anon');
await assert.rejects(db.query('select id from public.job_candidates'),/permission denied/);
await db.exec('reset role');
}finally{await db.close();}
console.log('PASS: >1,000 ATS rows and joined names, pagination errors, historical attachments, general-source routing, and 7 general + 14 role submissions with receipts, retry, closed/cross-unit guards and atomic rollback.');

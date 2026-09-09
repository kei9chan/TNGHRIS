// Synthetic UI integration checks only. All Supabase traffic is intercepted.
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
const year=new Date().getUTCFullYear();
const employee={id:'test-employee',name:'Test Employee',number:'TEST-001',home_bu:'Test Home BU',employment_status:'Regular',eligible:true};
const destinations=['The Dessert Museum','Gootopia','Bakebe','The Fun Roof','Inflatable Island'].map((brand,i)=>({id:`bu-${i}`,name:brand,brand,color:'#7c3aed'}));
let requests=[],draft=null;let actions=[];
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*.supabase.co/**',async route=>{
 const method=route.request().url().split('/').pop();let payload={};try{payload=route.request().postDataJSON()||{};}catch{}
 let data;
 if(method==='get_family_visits')data={year,hr:false,employee,destinations,requests,draft};
 else if(method==='submit_family_visit'){assert.equal(payload.p_family.length,4);const d=destinations.find(d=>d.id===payload.p_destination);requests=[{id:'test-request',employee_id:employee.id,employee_name:employee.name,date_needed:payload.p_date,status:'Pending HR Review',submission_date:new Date().toISOString(),can_review:true,can_operate:true,eligibility:{eligible:true,reason:'Eligible for Approval',used:0,pending:1,remaining_after_approval:3},family_visit:{destination_id:d.id,destination_name:d.name,brand:d.brand,family:payload.p_family,reference:'FVP-TEST-001',employee_number:employee.number,home_bu:employee.home_bu}}];draft=null;data='test-request';}
 else if(method==='get_family_visit_detail')data={request:requests[0],audit:[],approver:'Test Approver'};
 else if(method==='review_benefit_request'){requests[0].status='Approved';requests[0].bod_approved_at=new Date().toISOString();data=requests[0];}
 else if(method==='family_visit_action'){actions.push(payload.p_action);data=null;}
 else if(method==='save_family_visit_draft'){draft=payload.p_payload;data=null;}
 else throw new Error(`Unexpected Supabase request ${method}`);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await page.goto('http://127.0.0.1:4178/tests/familyVisitHarness.html');
await page.getByText('Used: 0 of 4',{exact:false}).waitFor();
assert.equal(await page.getByRole('button',{name:'Request Visit',exact:true}).count(),4);
await page.screenshot({path:'/workspace/scratch/414d96cc55ea/family-visits-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Request Visit',exact:true}).first().click();
await page.getByLabel('Destination BU / branch').selectOption('bu-1');
await page.getByLabel('Intended visit date',{exact:true}).fill(`${year}-12-20`);
for(let i=0;i<4;i++){await page.getByRole('button',{name:'Add family member'}).click();await page.getByLabel('Full name',{exact:true}).nth(i).fill(`Test Family ${i+1}`);await page.getByLabel('Relationship',{exact:true}).nth(i).fill('Sibling');}
assert(await page.getByRole('button',{name:'Add family member'}).isDisabled());
await page.getByText('I understand that only entry is covered.').click();await page.getByText('I confirm that the information is correct',{exact:false}).click();
await page.getByRole('button',{name:'Save Draft',exact:true}).click();await page.getByText('Draft visit saved').waitFor();await page.getByRole('button',{name:'Resume Draft'}).click();
await page.getByRole('button',{name:'Submit for Approval',exact:true}).click();await page.getByRole('dialog').waitFor();
await page.getByText('Annual entitlement: Four different BU visits').waitFor();await page.getByRole('button',{name:'Approve',exact:true}).click();
await page.getByRole('button',{name:'Download PDF Pass',exact:true}).waitFor();
const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF Pass',exact:true}).click();const download=await downloadPromise;await download.saveAs('/workspace/scratch/414d96cc55ea/family-visit-test-pass.pdf');assert(actions.includes('pdf_generated'));
await page.getByRole('button',{name:'Close',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:'/workspace/scratch/414d96cc55ea/family-visits-mobile-dark.png',fullPage:true});
await page.getByRole('button',{name:'Request Visit',exact:true}).first().click();assert(await page.locator('option[value="bu-1"]').isDisabled());
assert.deepEqual(errors,[]);console.log('PASS: four cards, guest cap, draft, submission, annual approval view, PDF download, duplicate destination selection and mobile rendering (mocked RPCs).');await browser.close();

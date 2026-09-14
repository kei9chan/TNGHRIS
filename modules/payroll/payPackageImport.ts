import type {PayContext} from './payPackages';

export const packageHeaders=['Package key','Employee code','Business unit / payroll group','Pay stream','Effective from','Amount unit','Basic pay / fee amount','PAN ID (optional)','Source reference','Reason','Engagement reference','Tax profile reference'];
export const componentHeaders=['Package key','Component name','Amount','Frequency','Payable date','Legacy field'];
export const simpleHeaders=['Employee code','Business unit','Pay type','Effective date','Amount unit','Approved basic pay / fee','Existing de minimis','Existing reimbursable',
 'Salary arrangement','Agreed net amount','Arrangement document','Tax treatment','Exemption / tax basis',
 ...[1,2,3].flatMap(i=>[`Extra ${i} name`,`Extra ${i} amount`,`Extra ${i} frequency`,`Extra ${i} payable date`]),
 'Salary source','PAN ID (if applicable)','Source document / note','Reason for this record','Consultant agreement','Consultant tax document'];
export const arrangements={'Gross salary':'gross','Company pays income tax':'net_tax','Company pays income tax and employee contributions':'net_all','Net - company covers tax':'net_tax','Net - company covers tax and employee shares':'net_all','Custom - needs review':'custom_review'} as const;
// Enable only after the reviewed production net-arrangement migration is applied.
export const NET_ARRANGEMENTS_LIVE=true;
export function assertArrangementLive(basis:string='gross'){
 if(!NET_ARRANGEMENTS_LIVE&&basis!=='gross')throw new Error('Net/custom salary arrangements are not live yet. The production payroll-engine update needs approval. This row has not been saved; do not relabel it as Gross.');
}
// Normalize comparisons, while retaining the original uploaded row for corrections/audit.
export const cleanImportText=(s:string)=>s.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/\s+/g,' ').trim();
export const importKey=(s:string)=>cleanImportText(s).toLowerCase();
const choice=(s:string,options:string[])=>options.find(x=>importKey(x)===importKey(s))||cleanImportText(s);
export function readImportSheet(workbook:import('exceljs').Workbook,name:string,headers:string[]){
 const sheets=workbook.worksheets.filter(s=>importKey(s.name)===importKey(name));
 if(sheets.length!==1)throw new Error(`Missing or ambiguous ${name} sheet.`);
 const sheet=sheets[0];if(sheet.rowCount>1001)throw new Error(`${name}: maximum 1,000 rows.`);
 const cell=(r:number,c:number)=>{
  const v=sheet.getCell(r,c).value;if(v==null)return '';if(v instanceof Date)return v.toISOString().slice(0,10);
  if(typeof v==='object'){
   if('richText' in v)return v.richText.map(t=>t.text).join('');
   if('hyperlink' in v)return v.text;
   throw new Error(`${name} row ${r}: use values, not formulas.`);
  }return String(v);
 };
 const columns=headers.map(h=>{
  const matches:number[]=[];for(let c=1;c<=sheet.columnCount;c++)if(importKey(cell(1,c))===importKey(h))matches.push(c);
  if(matches.length!==1)throw new Error(`${name}: missing or duplicate header ${h}.`);return matches[0];
 });
 const result:{row:number;values:Record<string,string>}[]=[];
 for(let r=2;r<=sheet.rowCount;r++){
  const values=Object.fromEntries(headers.map((h,i)=>[h,cell(r,columns[i])]));
  if(Object.values(values).some(v=>cleanImportText(v)))result.push({row:r,values});
 }return result;
}
export function simpleImportRows(input:{row:number;values:Record<string,string>}[]):ImportRow[]{
 return input.map(({row,values:v})=>{
  const get=(k:string)=>cleanImportText(v[k]||'');
  const values=Object.fromEntries(packageHeaders.map(k=>[k,'']));
  Object.assign(values,{'Package key':`ROW-${row}`,'Employee code':get('Employee code'),'Business unit / payroll group':get('Business unit'),
   'Pay stream':({'Employee salary':'employee_payroll','Consultant fee':'professional_fee'} as Record<string,string>)[choice(get('Pay type'),['Employee salary','Consultant fee'])]||get('Pay type'),
   'Effective from':get('Effective date'),'Amount unit':get('Amount unit'),'Basic pay / fee amount':get('Approved basic pay / fee'),
   'Salary source':get('Salary source'),'PAN ID (optional)':get('PAN ID (if applicable)'), 'Source reference':get('Source document / note')||get('Salary source'),
   Reason:get('Reason for this record'),'Engagement reference':get('Consultant agreement'),'Tax profile reference':get('Consultant tax document'),
   'Salary arrangement':get('Salary arrangement')||'Gross salary','Agreed net amount':get('Agreed net amount'),
   'Arrangement document':get('Arrangement document'),'Tax treatment':get('Tax treatment')||'Standard - Finance reviews',
   'Exemption / tax basis':get('Exemption / tax basis')});
  const components:Record<string,string>[]=[];
  for(const [header,name,key] of [['Existing de minimis','Existing HRIS de minimis','deminimis'],['Existing reimbursable','Existing HRIS reimbursable','reimbursable']]){
   if(get(header))components.push({'Component name':name,Amount:get(header),Frequency:'recurring','Payable date':'','Legacy field':key});
  }
  for(const i of [1,2,3]){
   if(['name','amount','frequency','payable date'].some(k=>get(`Extra ${i} ${k}`))){
    const frequency=get(`Extra ${i} frequency`)||'Recurring';
    components.push({'Component name':get(`Extra ${i} name`),Amount:get(`Extra ${i} amount`),Frequency:({'Recurring':'recurring','One time':'one_time'} as Record<string,string>)[choice(frequency,['Recurring','One time'])]||frequency,'Payable date':get(`Extra ${i} payable date`),'Legacy field':''});
   }
  }
  return {row,values,components};
 });
}
export type ImportRow={row:number;values:Record<string,string>;components:Record<string,string>[]};
const treatment=()=>Object.fromEntries(['tax','sss','philhealth','pagibig','thirteenthMonth','proration'].map(k=>[k,'unreviewed']));
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const amount=(s:string)=>/^\d+(\.\d{1,6})?$/.test(s)&&Number.isFinite(Number(s));
export function prepareImport(row:ImportRow,context:PayContext){
 const v=Object.fromEntries(Object.entries(row.values).map(([k,value])=>[k,cleanImportText(value)]));
 v['Salary arrangement']=choice(v['Salary arrangement']||'',Object.keys(arrangements));
 v['Amount unit']=choice(v['Amount unit'],['Monthly','Daily','Hourly']);
 v['Pay stream']=importKey(v['Pay stream']);
 v['Tax treatment']=choice(v['Tax treatment']||'',['Normal tax calculation','Standard - Finance reviews','Exemption requested - evidence required','Custom - needs review']);
 const fail=(message:string):never=>{throw new Error(message);};
 const basis=v['Salary arrangement']?(arrangements as Record<string,string>)[v['Salary arrangement']]:'gross';
 if(!basis)fail('Choose a listed salary arrangement; put special terms under Custom - needs review.');
 const target=v['Agreed net amount']||'';
 const agreement=v['Arrangement document']||'';
 if(basis!.startsWith('net_')&&(!/^\d+([.]\d{1,2})?$/.test(target)||Number(target)<=0||Number(target)>999999999))fail('Agreed net amount: enter the approved target amount, greater than zero, with at most 2 decimals. Keep it separate from basic pay.');
 if(basis!.startsWith('net_')&&agreement.trim().length<3)fail('Arrangement document: enter the reference/title and date of the approved JO, PAN or agreement that explicitly confirms the net terms. A JO is acceptable if it states what the company covers.');
 if(basis==='gross'&&target)fail('Leave agreed net amount blank for Gross salary.');
 if(basis==='custom_review'&&agreement.trim().length<3)fail('Custom arrangements need documented terms for review.');
 const taxMode=(!v['Tax treatment']||v['Tax treatment']==='Normal tax calculation')?'Standard - Finance reviews':v['Tax treatment'];
 if(!['Standard - Finance reviews','Exemption requested - evidence required','Custom - needs review'].includes(taxMode))fail('Choose a listed tax treatment; explain custom treatment in Exemption / tax basis.');
 if(taxMode!=='Standard - Finance reviews'&&(v['Exemption / tax basis']||'').trim().length<3)fail('Exemption/custom tax treatment requires the legal basis and supporting evidence. Net salary is not a tax exemption.');
 const scopes=context.scopes.filter(s=>importKey(s.name)===importKey(v[packageHeaders[2]]));
 const scope=scopes.length===1?scopes[0]:undefined;
 if(!scope)fail(`Conflicting salary source — Business unit does not uniquely match. Choose a payroll-group name available for this employee: ${context.scopes.map(s=>s.name).join(', ')||'none available'}.`);
 if(!scope?.canEdit)fail('Pay-package editing is not allowed for this employee and business unit. HR Manager needs scoped HR authorization and compensation-edit access; own-package edits are blocked.');
 if(!context.sourceHash)fail('The current salary source could not be loaded. Refresh and revalidate this employee.');
 const stream=v['Pay stream'];if(!['employee_payroll','professional_fee'].includes(stream))fail('Invalid pay stream.');
 if(!date(v['Effective from']))fail('Effective from must be a real YYYY-MM-DD date.');
 if(!['Monthly','Daily','Hourly'].includes(v['Amount unit']))fail('Amount unit must be Monthly, Daily or Hourly.');
 if(!amount(v['Basic pay / fee amount']))fail('Basic amount must be a nonnegative number with up to 6 decimals.');
 const source=resolveSalarySource(v,context);
 for(const k of ['Source reference','Reason'])if(v[k].trim().length<3)fail(`${k} needs at least 3 characters.`);
 const engagement=stream==='employee_payroll'?'employee':v['Engagement reference'];
 if(stream==='professional_fee'&&(!engagement||engagement==='employee'||v['Tax profile reference'].length<3))fail('Separate fees require a distinct engagement and tax-profile reference.');
 if(context.packages.some(p=>p.engagement_key===engagement&&p.effective_from===v['Effective from']&&p.status!=='rejected'))fail('A package already exists for this engagement and date. Review it individually.');
 const components=row.components.map(c=>{
  if(!c['Component name']||!amount(c.Amount))fail('Every component needs a name and nonnegative amount.');
  if(!['recurring','one_time'].includes(c.Frequency))fail('Component frequency must be recurring or one_time.');
  if(c.Frequency==='one_time'&&!date(c['Payable date']))fail('One-time components need a YYYY-MM-DD payable date.');
  if(!['','deminimis','reimbursable'].includes(c['Legacy field']))fail('Invalid legacy field.');
  return {...treatment(),name:c['Component name'],amount:c.Amount,recurrence:c.Frequency,payableDate:c['Payable date'],legacyField:c['Legacy field']};
 });
 if(components.length>30)fail('Maximum 30 components per package.');
 if(stream==='employee_payroll'){
  if(Number(v['Basic pay / fee amount'])!==Number(source!.baseAmount))fail(`Conflicting salary source — amount ${v['Basic pay / fee amount']} does not match ${source!.label}: ${source!.baseAmount}.`);
  if(source!.rateType&&importKey(v['Amount unit'])!==importKey(source!.rateType))fail(`Conflicting salary source — amount unit ${v['Amount unit']} does not match ${source!.rateType}.`);
  if(source!.effectiveFrom&&v['Effective from']!==source!.effectiveFrom)fail(`Conflicting salary source — effective date ${v['Effective from']} does not match ${source!.id}: ${source!.effectiveFrom}.`);
  for(const k of ['deminimis','reimbursable'] as const){
   const matching=components.filter(c=>c.legacyField===k);
   if(matching.length>1||Number(matching[0]?.amount||0)!==Number(source![k]||0))fail(`Conflicting salary source — ${k} component must match ${source!.label}: ${source![k]||0}.`);
  }
 }
 return {employeeId:context.employeeId,scopeId:scope!.id,hash:context.sourceHash!,payload:{effectiveFrom:v['Effective from'],rateType:v['Amount unit'],baseAmount:v['Basic pay / fee amount'],stream,engagementKey:engagement,taxProfileRef:v['Tax profile reference'],sourcePanId:source?.id||null,sourceRef:v['Source reference'],reason:v.Reason,components,treatment:{...treatment(),salarySource:stream==='employee_payroll'?(source?.id?'Approved PAN':'Current HRIS record'):'Consultant agreement',sourcePanReference:v['PAN ID (optional)'],payBasis:basis!,netTarget:target,arrangementRef:agreement,taxRequest:taxMode,taxBasisRef:v['Exemption / tax basis']||''},replacesId:null}};
}

function resolveSalarySource(v:Record<string,string>,context:PayContext){
 // Legacy Packages sheets had no source-choice column; retain their explicit reference workflow.
 let kind=importKey(v['Salary source']??(v['Pay stream']==='professional_fee'?'Consultant agreement':v['PAN ID (optional)']?'Approved PAN':v['Source reference']?'Current HRIS record':''));
 if(kind==='approved consultant agreement')kind='consultant agreement';
 const invalid=(s:string):never=>{throw new Error(s);};
 if(!kind)invalid('Missing salary source — choose the approved source for this row.');
 if(!['current hris record','approved pan','consultant agreement'].includes(kind))invalid('Invalid salary source — choose Current HRIS record, Approved PAN, or Consultant agreement.');
 if(v['Pay stream']==='professional_fee'){
  if(kind!=='consultant agreement')invalid('Conflicting salary source — Consultant fee requires a Consultant agreement, not an employee salary source.');
  if(v['PAN ID (optional)'])invalid('Conflicting salary source — a salary PAN cannot authorize a consultant-fee stream.');
  return null;
 }
 if(kind==='consultant agreement')invalid('Conflicting salary source — Consultant agreement cannot authorize Employee salary.');
 const pan=importKey(v['PAN ID (optional)']);
 if(kind==='approved pan'&&!pan)invalid('Missing salary source — Approved PAN requires its PAN ID or PAN reference.');
 if(pan&&!/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|pan-[0-9a-f]{8})$/.test(pan))invalid('Invalid salary source — PAN ID must be a UUID or PAN-XXXXXXXX reference.');
 const pans=pan?context.sources.filter(s=>s.id&&(importKey(s.id)===pan||`pan-${s.id.slice(0,8).toLowerCase()}`===pan)):[];
 if(pan&&pans.length!==1)invalid(`Conflicting salary source — ${v['PAN ID (optional)']} matches ${pans.length} approved records for this employee${pans.length?': '+pans.map(s=>s.id).join(', '):'; check the employee code and PAN approval'}.`);
 // The optional PAN is supporting documentation when Current HRIS record is selected.
 const matches=kind==='approved pan'?pans:context.sources.filter(s=>s.id==null);
 if(matches.length!==1)invalid(`Conflicting salary source — ${kind} matches ${matches.length} approved records: ${matches.map(s=>s.id||s.label).join(', ')||'none'}.`);
 const source=matches[0];
 if(source.conflict)invalid(`Conflicting salary source — ${source.label}: HRIS rate ${context.legacy?.rateAmount} and basic salary ${context.legacy?.salaryBasic} need reconciliation.`);
 if(source.baseAmount==null)invalid(`Conflicting salary source — ${source.label} has no approved base amount.`);
 return source;
}

export function verifySavedImport(prepared:ReturnType<typeof prepareImport>,context:PayContext,id:string,row:ImportRow){
 const saved=context.packages.find(p=>p.id===id);const expected=prepared.payload;
 if(context.employeeId!==prepared.employeeId||!saved||saved.status!=='draft'||saved.scope_id!==prepared.scopeId||
  saved.stream!==expected.stream||saved.effective_from!==expected.effectiveFrom||saved.rate_type!==expected.rateType||
  Number(saved.base_amount)!==Number(expected.baseAmount)||saved.source_ref!==expected.sourceRef||
  (saved.source_pan_id||null)!==expected.sourcePanId||saved.treatment.salarySource!==expected.treatment.salarySource||
  saved.treatment.sourcePanReference!==expected.treatment.sourcePanReference)
  throw new Error('Draft save could not be verified after reload. Check the employee’s saved packages before retrying; uploaded values have been retained.');
 // Revalidate the approved source from the reload, excluding only the draft just saved.
 prepareImport(row,{...context,packages:context.packages.filter(p=>p.id!==id)});
 return saved;
}

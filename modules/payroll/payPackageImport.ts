import type {PayContext} from './payPackages';

export const packageHeaders=['Package key','Employee code','Business unit / payroll group','Pay stream','Effective from','Amount unit','Basic pay / fee amount','PAN ID (optional)','Source reference','Reason','Engagement reference','Tax profile reference'];
export const componentHeaders=['Package key','Component name','Amount','Frequency','Payable date','Legacy field'];
export const baseSimpleHeaders=['Employee code','Business unit','Pay type','Effective date','Amount unit','Approved basic pay / fee','Existing de minimis','Existing reimbursable',
 'Salary arrangement','Agreed net amount','Arrangement document','Tax treatment','Exemption / tax basis',
 ...[1,2,3].flatMap(i=>[`Extra ${i} name`,`Extra ${i} amount`,`Extra ${i} frequency`,`Extra ${i} payable date`]),
 'Salary source','PAN ID (if applicable)','Source document / note','Reason for this record','Consultant agreement','Consultant tax document'];
export const optionalSimpleHeaders=['Employee name','Engagement type','Pay frequency','Gross/net arrangement','Tax responsibility','Tax coverage scope','Benefit responsibility','Component type','Component name','Amount','Frequency','Tax treatment detail','Receipt required','Receipt or document reference','Policy reference','Notes'];
export const simpleHeaders=[...baseSimpleHeaders,...optionalSimpleHeaders];
export const arrangements={'Gross salary':'gross','Gross pay':'gross','Company pays income tax':'net_tax','Net of tax':'net_tax','Gross with selected components covered':'custom_review','Company pays income tax and employee contributions':'net_all','Net of tax and benefits':'net_all','Net - company covers tax':'net_tax','Net - company covers tax and employee shares':'net_all','Custom - needs review':'custom_review'} as const;
// Enable only after the reviewed production net-arrangement migration is applied.
export const NET_ARRANGEMENTS_LIVE=true;
export function assertArrangementLive(basis:string='gross'){
 if(!NET_ARRANGEMENTS_LIVE&&basis!=='gross')throw new Error('Net/custom salary arrangements are not live yet. The production payroll-engine update needs approval. This row has not been saved; do not relabel it as Gross.');
}
// Normalize comparisons, while retaining the original uploaded row for corrections/audit.
export const cleanImportText=(s:string)=>s.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,'').replace(/\s+/g,' ').trim();
export const importKey=(s:string)=>cleanImportText(s).toLowerCase();
const choice=(s:string,options:string[])=>options.find(x=>importKey(x)===importKey(s))||cleanImportText(s);
export function readImportSheet(workbook:import('exceljs').Workbook,name:string,headers:string[],optionalHeaders:string[]=optionalSimpleHeaders){
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
  if(matches.length>1||(!optionalHeaders.includes(h)&&matches.length!==1))throw new Error(`${name}: missing or duplicate header ${h}.`);return matches[0]||0;
 });
 const result:{row:number;values:Record<string,string>}[]=[];
 for(let r=2;r<=sheet.rowCount;r++){
  const values=Object.fromEntries(headers.map((h,i)=>[h,columns[i]?cell(r,columns[i]):'']));
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
   'Salary arrangement':get('Gross/net arrangement')||get('Salary arrangement')||'Gross salary','Agreed net amount':get('Agreed net amount'),
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
  if(get('Component name')||get('Amount'))components.push({'Component name':get('Component name'),'Amount':get('Amount'),'Frequency':({'Monthly':'recurring','Per cutoff':'recurring','Daily':'recurring','Hourly':'recurring','One time':'one_time','Per invoice':'recurring'} as Record<string,string>)[choice(get('Frequency')||'Monthly',['Monthly','Per cutoff','Daily','Hourly','One time','Per invoice'])]||'recurring','Payable date':'','Legacy field':get('Component type')==='De minimis benefits'?'deminimis':get('Component type')==='Reimbursable allowance'?'reimbursable':'','Component type':get('Component type'),'Tax treatment detail':get('Tax treatment detail'),'Receipt required':get('Receipt required'),'Receipt or document reference':get('Receipt or document reference'),'Policy reference':get('Policy reference'),'Notes':get('Notes')});
  values['Tax responsibility']=get('Tax responsibility');values['Tax coverage scope']=get('Tax coverage scope');values['Benefit responsibility']=get('Benefit responsibility');values['Pay frequency']=get('Pay frequency');values['Engagement type']=get('Engagement type');values['Receipt or document reference']=get('Receipt or document reference');values.Notes=get('Notes');
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
 v['Amount unit']=choice(v['Amount unit'],['Monthly','Daily','Hourly','Per invoice','Other approved frequency']);
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
 if(!['Monthly','Daily','Hourly',...(stream==='professional_fee'?['Per invoice','Other approved frequency']:[])].includes(v['Amount unit']))fail(stream==='professional_fee'?'Amount unit must be Monthly, Daily, Hourly, Per invoice, or Other approved frequency.':'Amount unit must be Monthly, Daily or Hourly.');
 if(!amount(v['Basic pay / fee amount']))fail('Basic amount must be a nonnegative number with up to 6 decimals.');
 resolveSalarySource(v,context);
 for(const k of ['Source reference','Reason'])if(v[k].trim().length<3)fail(`${k} needs at least 3 characters.`);
 const engagement=stream==='employee_payroll'?'employee':v['Engagement reference'];
 if(stream==='professional_fee'&&(!engagement||engagement==='employee'||v['Tax profile reference'].length<3))fail('Consultant invoice or supporting document required, including a distinct engagement and tax-profile reference.');
 if(context.packages.some(p=>p.scope_id===scope!.id&&p.stream===stream&&p.effective_from===v['Effective from']&&p.status!=='rejected'))fail('Duplicate active package for the same employee, business unit, pay stream, and effective date.');
 const components=row.components.map(c=>{
  if(!c['Component name']||!amount(c.Amount))fail('Every component needs a name and nonnegative amount.');
  if(!['recurring','one_time'].includes(c.Frequency))fail('Component frequency must be recurring or one_time.');
  if(c.Frequency==='one_time'&&!date(c['Payable date']))fail('One-time components need a YYYY-MM-DD payable date.');
  if(!['','deminimis','reimbursable'].includes(c['Legacy field']))fail('Invalid legacy field.');
  const category=({'De minimis benefits':'de_minimis','Fixed allowance':'fixed_allowance','Reimbursable allowance':'reimbursable_allowance','Service charge or variable pay':'service_charge','Employee deduction':'employee_deduction','Employee-paid benefit':'employee_paid_benefit','Employer-paid benefit':'employer_paid_benefit','Employer contribution':'employer_contribution','Other approved component':'other'} as Record<string,string>)[c['Component type']]||(c['Legacy field']==='deminimis'?'de_minimis':c['Legacy field']==='reimbursable'?'reimbursable_allowance':'fixed_allowance');
  const receiptRequired=importKey(c['Receipt required']||'')==='yes'||category==='reimbursable_allowance';
  const taxDetail=c['Tax treatment detail']||'';
  const taxTreatment=taxDetail?importKey(taxDetail).replaceAll(' ','_'):category==='de_minimis'?'non_taxable':category==='reimbursable_allowance'?'reimbursable':'taxable';
  return {...treatment(),name:c['Component name'],amount:c.Amount,recurrence:c.Frequency,payableDate:c['Payable date'],legacyField:c['Legacy field'],category,frequency:c.Frequency==='one_time'?'One time':v['Pay frequency']||v['Amount unit'],taxTreatment,tax:taxTreatment==='non_taxable'?'excluded':taxTreatment==='taxable'?'included':'unreviewed',receiptRequired,receiptStatus:receiptRequired?(c['Receipt or document reference']?'receipt_submitted':'receipt_required'):undefined,documentRef:c['Receipt or document reference']||'',policyRef:c['Policy reference']||'',notes:c.Notes||''};
 });
 if(components.length>30)fail('Maximum 30 components per package.');
 const responsibility=(value:string|undefined,fallback:string)=>({'employee':'employee','employer':'employer','split':'split'} as Record<string,string>)[importKey(value||'')]||fallback;
 const coverage=({'basic pay only':'basic_only','selected components':'selected_components','entire package':'entire_package'} as Record<string,string>)[importKey(v['Tax coverage scope']||'')]||'entire_package';
 return {employeeId:context.employeeId,scopeId:scope!.id,hash:context.sourceHash!,payload:{effectiveFrom:v['Effective from'],rateType:v['Amount unit'],baseAmount:v['Basic pay / fee amount'],stream,engagementKey:engagement,taxProfileRef:v['Tax profile reference'],sourcePanId:null,sourceKind:'direct_entry',sourceRef:v['Source reference'],reason:v.Reason,components,treatment:{...treatment(),submissionIntent:'draft',salarySource:stream==='employee_payroll'?'Direct compensation entry':'Consultant agreement',sourcePanReference:'',payBasis:basis!,netTarget:target,arrangementRef:agreement,taxRequest:taxMode,taxBasisRef:v['Exemption / tax basis']||'',taxResponsibility:responsibility(v['Tax responsibility'],basis==='gross'?'employee':'employer'),taxCoverage:coverage,benefitResponsibility:responsibility(v['Benefit responsibility'],basis==='net_all'?'employer':'employee'),payFrequency:v['Pay frequency']||v['Amount unit'],calculationVersion:'pay-package-builder-v2',supportingDocumentRef:v['Receipt or document reference']||'',notes:v.Notes||'',entrySource:'excel_upload'},replacesId:null,entrySource:'excel_upload'}};
}

export type ImportValidationStatus='ready'|'review'|'blocked'|'skipped';
export function classifyImportIssue(error:string,row?:ImportRow):ImportValidationStatus{
 if(!error){const components=row?.components||[];if(components.some(component=>(importKey(component['Receipt required']||'')==='yes'||component['Legacy field']==='reimbursable')&&!component['Receipt or document reference']))return 'review';return 'ready';}
 const normalized=importKey(error);
 if(normalized.includes('invoice')||normalized.includes('supporting document')||normalized.includes('receipt')||normalized.includes('custom arrangements'))return 'review';
 return 'blocked';
}

export function autoMapHeaders(sourceHeaders:string[],destinationHeaders:string[]=simpleHeaders){
 const aliases:Record<string,string[]>= {'Employee code':['Employee ID'],'Business unit':['Business unit / payroll group'],'Pay type':['Pay stream'],'Effective date':['Effective from'],'Amount unit':['Pay frequency'],'Approved basic pay / fee':['Basic pay or fee'],'Salary arrangement':['Gross/net arrangement'],'Consultant agreement':['Engagement or project scope'],'Consultant tax document':['Tax profile reference'],'Source document / note':['Receipt or document reference']};
 return Object.fromEntries(destinationHeaders.map(destination=>{const candidates=[destination,...(aliases[destination]||[])];const source=sourceHeaders.find(header=>candidates.some(candidate=>importKey(candidate)===importKey(header)));return [destination,source||''];}));
}

export type InspectedImportSheet={headers:string[];rows:{row:number;values:Record<string,string>}[]};
export function inspectImportSheet(workbook:import('exceljs').Workbook,name='Pay Input'):InspectedImportSheet{
 const sheets=workbook.worksheets.filter(sheet=>importKey(sheet.name)===importKey(name));
 if(sheets.length!==1)throw new Error(`Missing or ambiguous ${name} sheet.`);
 const sheet=sheets[0];if(sheet.rowCount>1001)throw new Error(`${name}: maximum 1,000 rows.`);
 const cell=(row:number,column:number)=>{const value=sheet.getCell(row,column).value;if(value==null)return '';if(value instanceof Date)return value.toISOString().slice(0,10);if(typeof value==='object'){if('richText' in value)return value.richText.map(part=>part.text).join('');if('hyperlink' in value)return value.text;throw new Error(`${name} row ${row}: use values, not formulas.`);}return String(value);};
 const headers=Array.from({length:sheet.columnCount},(_,index)=>cleanImportText(cell(1,index+1)));
 if(headers.some((header,index)=>header&&headers.findIndex(value=>importKey(value)===importKey(header))!==index))throw new Error(`${name}: duplicate column headers are not supported.`);
 const rows=[];for(let row=2;row<=sheet.rowCount;row++){const values=Object.fromEntries(headers.map((header,index)=>[header,cell(row,index+1)]));if(Object.values(values).some(value=>cleanImportText(value)))rows.push({row,values});}
 return {headers:headers.filter(Boolean),rows};
}

export function mapInspectedRows(sheet:InspectedImportSheet,mapping:Record<string,string>):ImportRow[]{
 return simpleImportRows(sheet.rows.map(row=>({row:row.row,values:Object.fromEntries(simpleHeaders.map(destination=>[destination,mapping[destination]?row.values[mapping[destination]]||'':'']))})));
}

function resolveSalarySource(v:Record<string,string>,context:PayContext){
 // Legacy Packages sheets had no source-choice column; retain their explicit reference workflow.
 let kind=importKey(v['Salary source']??(v['Pay stream']==='professional_fee'?'Consultant agreement':v['PAN ID (optional)']?'Approved PAN':v['Source reference']?'Current HRIS record':''));
 if(kind==='approved consultant agreement')kind='consultant agreement';
 const invalid=(s:string):never=>{throw new Error(s);};
 if(!kind)invalid('Missing salary source — choose the approved source for this row.');
 if(!['current hris record','approved pan','consultant agreement'].includes(kind))invalid('Invalid salary source — choose Current HRIS record, Approved PAN, or Consultant agreement.');
 if(kind==='approved pan')invalid('Approved PAN compensation is generated automatically after final approval; do not upload or reapprove it as a pay-package draft.');
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

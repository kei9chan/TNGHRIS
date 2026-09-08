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
export function simpleImportRows(input:{row:number;values:Record<string,string>}[]):ImportRow[]{
 return input.map(({row,values:v})=>{
  const get=(k:string)=>v[k]?.trim()||'';
  const values=Object.fromEntries(packageHeaders.map(k=>[k,'']));
  Object.assign(values,{'Package key':`ROW-${row}`,'Employee code':get('Employee code'),'Business unit / payroll group':get('Business unit'),
   'Pay stream':({'Employee salary':'employee_payroll','Consultant fee':'professional_fee'} as Record<string,string>)[get('Pay type')]||get('Pay type'),
   'Effective from':get('Effective date'),'Amount unit':get('Amount unit'),'Basic pay / fee amount':get('Approved basic pay / fee'),
   'PAN ID (optional)':get('PAN ID (if applicable)'), 'Source reference':get('Source document / note')||get('Salary source'),
   Reason:get('Reason for this record'),'Engagement reference':get('Consultant agreement'),'Tax profile reference':get('Consultant tax document'),
   'Salary arrangement':get('Salary arrangement')||'Gross salary','Agreed net amount':get('Agreed net amount'),
   'Arrangement document':get('Arrangement document'),'Tax treatment':get('Tax treatment')||'Standard - Finance reviews',
   'Exemption / tax basis':get('Exemption / tax basis')});
  if(get('Salary source')==='Approved PAN'&&!get('PAN ID (if applicable)'))throw new Error(`Row ${row}: Approved PAN needs its PAN ID.`);
  const components:Record<string,string>[]=[];
  for(const [header,name,key] of [['Existing de minimis','Existing HRIS de minimis','deminimis'],['Existing reimbursable','Existing HRIS reimbursable','reimbursable']]){
   if(get(header))components.push({'Component name':name,Amount:get(header),Frequency:'recurring','Payable date':'','Legacy field':key});
  }
  for(const i of [1,2,3]){
   if(['name','amount','frequency','payable date'].some(k=>get(`Extra ${i} ${k}`))){
    const frequency=get(`Extra ${i} frequency`)||'Recurring';
    components.push({'Component name':get(`Extra ${i} name`),Amount:get(`Extra ${i} amount`),Frequency:({'Recurring':'recurring','One time':'one_time'} as Record<string,string>)[frequency]||frequency,'Payable date':get(`Extra ${i} payable date`),'Legacy field':''});
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
 const v=row.values;const fail=(message:string):never=>{throw new Error(message);};
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
 const scope=context.scopes.find(s=>s.name===v[packageHeaders[2]]);
 if(!scope)fail(`Business unit: choose an exact payroll-group name available for this employee: ${context.scopes.map(s=>s.name).join(', ')||'none available'}.`);
 if(!scope?.canEdit)fail('Pay-package editing is not allowed for this employee and business unit. HR Manager needs scoped HR authorization and compensation-edit access; own-package edits are blocked.');
 if(!context.sourceHash)fail('The current salary source could not be loaded. Refresh and revalidate this employee.');
 const stream=v['Pay stream'];if(!['employee_payroll','professional_fee'].includes(stream))fail('Invalid pay stream.');
 if(!date(v['Effective from']))fail('Effective from must be a real YYYY-MM-DD date.');
 if(!['Monthly','Daily','Hourly'].includes(v['Amount unit']))fail('Amount unit must be Monthly, Daily or Hourly.');
 if(!amount(v['Basic pay / fee amount']))fail('Basic amount must be a nonnegative number with up to 6 decimals.');
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
  const source=context.sources.find(s=>(s.id||'')===v['PAN ID (optional)']);
  if(!source||source.conflict||source.baseAmount==null)fail('Approved salary source is missing or conflicting.');
  if(Number(v['Basic pay / fee amount'])!==Number(source!.baseAmount))fail('Base amount must match the HRIS / approved PAN source.');
  if(source!.rateType&&v['Amount unit']!==source!.rateType)fail('Amount unit differs from the approved source.');
  if(source!.effectiveFrom&&v['Effective from']!==source!.effectiveFrom)fail('Effective date differs from the approved PAN.');
  for(const k of ['deminimis','reimbursable'] as const){
   const matching=components.filter(c=>c.legacyField===k);
   if(matching.length>1||Number(matching[0]?.amount||0)!==Number(source![k]||0))fail(`${k} component must match the approved source exactly.`);
  }
 }
 return {employeeId:context.employeeId,scopeId:scope!.id,hash:context.sourceHash!,payload:{effectiveFrom:v['Effective from'],rateType:v['Amount unit'],baseAmount:v['Basic pay / fee amount'],stream,engagementKey:engagement,taxProfileRef:v['Tax profile reference'],sourcePanId:stream==='employee_payroll'?v['PAN ID (optional)']||null:null,sourceRef:v['Source reference'],reason:v.Reason,components,treatment:{...treatment(),payBasis:basis!,netTarget:target,arrangementRef:agreement,taxRequest:taxMode,taxBasisRef:v['Exemption / tax basis']||''},replacesId:null}};
}

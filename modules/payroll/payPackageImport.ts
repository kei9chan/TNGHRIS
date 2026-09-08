import type {PayContext} from './payPackages';

export const packageHeaders=['Package key','Employee code','Business unit / payroll group','Pay stream','Effective from','Amount unit','Basic pay / fee amount','PAN ID (optional)','Source reference','Reason','Engagement reference','Tax profile reference'];
export const componentHeaders=['Package key','Component name','Amount','Frequency','Payable date','Legacy field'];
export type ImportRow={row:number;values:Record<string,string>;components:Record<string,string>[]};
const treatment=()=>Object.fromEntries(['tax','sss','philhealth','pagibig','thirteenthMonth','proration'].map(k=>[k,'unreviewed']));
const date=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const amount=(s:string)=>/^\d+(\.\d{1,6})?$/.test(s)&&Number.isFinite(Number(s));
export function prepareImport(row:ImportRow,context:PayContext){
 const v=row.values;const fail=(message:string):never=>{throw new Error(message);};
 const scope=context.scopes.find(s=>s.name===v[packageHeaders[2]]&&s.canEdit);
 if(!scope||!context.sourceHash)fail('No edit access to the selected payroll scope.');
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
 return {employeeId:context.employeeId,scopeId:scope!.id,hash:context.sourceHash!,payload:{effectiveFrom:v['Effective from'],rateType:v['Amount unit'],baseAmount:v['Basic pay / fee amount'],stream,engagementKey:engagement,taxProfileRef:v['Tax profile reference'],sourcePanId:stream==='employee_payroll'?v['PAN ID (optional)']||null:null,sourceRef:v['Source reference'],reason:v.Reason,components,treatment:treatment(),replacesId:null}};
}

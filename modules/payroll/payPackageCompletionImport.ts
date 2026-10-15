import type {Workbook, Worksheet} from 'exceljs';
import {cleanImportText, importKey as normalizedKey, ImportRow, packageHeaders} from './payPackageImport';
const importKey=(value?:string)=>normalizedKey(value||'');

// Column labels such as "Employee 13" are presentation only: each tab can have
// deleted or inserted employee columns. Join on the actual employee code.
const codeKey=(value:string)=>importKey(value).replace(/[^a-z0-9]/g,'');
const example=(value:string)=>/^(?:EX-|EXAMPLE-|DEMO-)/i.test(value.trim());
function text(sheet:Worksheet,row:number,column:number){
 const cell=sheet.getCell(row,column),value=cell.value;
 if(value==null)return '';
 if(value instanceof Date)return value.toISOString().slice(0,10);
 if(typeof value==='object'){
  if('richText' in value)return cleanImportText(value.richText.map(part=>part.text).join(''));
  if('hyperlink' in value)return cleanImportText(value.text);
  throw new Error(`${sheet.name} ${cell.address}: replace formulas or linked values with verified values.`);
 }
 return cleanImportText(String(value));
}
function sheetFor(workbook:Workbook,name:string){
 const matches=workbook.worksheets.filter(sheet=>importKey(sheet.name)===importKey(name));
 if(matches.length>1)throw new Error(`Duplicate ${name} sheets.`);
 return matches[0];
}
function columns(sheet:Worksheet,idField:string){
 const fields=new Map<string,number>();
 for(let row=2;row<=Math.min(sheet.rowCount,1001);row++){
  const field=text(sheet,row,1);if(!field)continue;
  if(fields.has(field))throw new Error(`${sheet.name}: duplicate field ${field}.`);
  fields.set(field,row);
 }
 if(!fields.has(idField))throw new Error(`${sheet.name}: missing ${idField}.`);
 return Array.from({length:Math.max(0,sheet.columnCount-4)},(_,index)=>{
  const column=index+5;
  return {column,values:Object.fromEntries([...fields].map(([field,row])=>[field,text(sheet,row,column)]))};
 }).filter(item=>item.values[idField]&&!example(item.values[idField]));
}

/** Read the filled completion workbook without importing profile identifiers,
 * examples, company policies or implied approvals as salary records. */
export function readPayPackageCompletion(workbook:Workbook):ImportRow[]|null{
 const packages=sheetFor(workbook,'02 Pay Packages');
 if(!packages)return null;
 const profiles=sheetFor(workbook,'01 Profiles');
 if(!profiles)throw new Error('Completion workbook: 01 Profiles is required to identify each package’s business unit.');
 const profileRecords=columns(profiles,'Employee ID');
 const profileFor=(code:string)=>{
  const matches=profileRecords.filter(profile=>codeKey(profile.values['Employee ID'])===codeKey(code));
  if(matches.length>1)throw new Error(`Completion workbook: ambiguous profile for ${code}.`);
  return matches[0]?.values;
 };
 const benefitSheet=sheetFor(workbook,'03 Benefits');
 const benefits:{code:string;values:Record<string,string>;row:number}[]=[];
 if(benefitSheet){
  const headers=Array.from({length:benefitSheet.columnCount},(_,index)=>text(benefitSheet,1,index+1));
  if(!headers.includes('Employee ID'))throw new Error('03 Benefits: missing Employee ID header.');
  for(let row=2;row<=Math.min(benefitSheet.rowCount,1001);row++){
   const values=Object.fromEntries(headers.map((header,index)=>[header,text(benefitSheet,row,index+1)]));
   if(values['Employee ID']&&!example(values['Employee ID']))benefits.push({code:values['Employee ID'],values,row});
  }
 }
 const imports:ImportRow[]=columns(packages,'Employee ID').map(({column,values:p})=>{
  const profile=profileFor(p['Employee ID']);
  const values=Object.fromEntries(packageHeaders.map(header=>[header,'']));
  Object.assign(values,{
   'Package key':p['Package ID / version']||`COMPLETION-${column}`,
   'Employee code':profile?.['Employee ID']||p['Employee ID'],
   'Employee name':profile?.['Legal full name']||'',
   'Business unit / payroll group':profile?.['Business unit']||'',
   'Pay stream':'employee_payroll','Effective from':p['Effective from'],
   'Amount unit':p['Salary basis'],'Basic pay / fee amount':(p['Basic amount (PHP)']||'').replace(/,/g,''),
   'Salary source':'Current HRIS record','Source reference':p['PAN / authorization reference']||'Employee Profile & Pay Package Completion — draft setup',
   Reason:'Initial package from completed HR setup workbook; requires approval',
   'Salary arrangement':importKey(p['Pay treatment'])==='gross'?'Gross salary':p['Pay treatment'],
   'Tax treatment':'Standard - Finance reviews',
   'Tax responsibility':importKey(p['Employer-paid withholding tax'])==='yes'?'Employer':'Employee',
   'Benefit responsibility':importKey(p['Employer-paid employee contributions'])==='yes'?'Employer':'Employee',
   Notes:`Source column ${column}; package status ${p['Approval status']||'not supplied'}. ${p['Outstanding conflict / action']||''}`,
  });
  for(const [field,value] of Object.entries(values))values[field]=value??'';
  const issues:NonNullable<ImportRow['issues']>=[];
  const review=(field:string,message:string,fixed=false)=>issues.push({field,value:values[field],message:`Needs review: ${message}`,fixed});
  if(!profile)review('Business unit / payroll group','This package has no matching profile. Confirm the employee code and business unit.');
  if(p.Currency&&importKey(p.Currency)!=='php')review('Basic pay / fee amount','Only PHP packages are supported. Correct the currency in the source workbook before importing.',true);
  if(p['Effective to'])review('Effective from','This package has an end date. Review its date range in the individual builder.',true);
  if(importKey(p['Pay treatment'])!=='gross')review('Salary arrangement','Confirm the net/custom arrangement, approved target amount and supporting agreement; the source terms have been retained.');
  else if(importKey(p['Employer-paid withholding tax'])==='yes'||importKey(p['Employer-paid employee contributions'])==='yes')review('Salary arrangement','Gross pay conflicts with employer-paid tax or employee contributions. Confirm the salary arrangement and documented terms.');
  const components=benefits.filter(benefit=>codeKey(benefit.code)===codeKey(p['Employee ID'])).map(({values:b,row})=>{
   const types:Record<string,string>={'de minimis':'De minimis benefits',reimbursement:'Reimbursable allowance','fixed allowance':'Fixed allowance',incentive:'Other approved component'};
   if(!types[importKey(b['Benefit type'])])review('Reason',`Benefit row ${row}: unsupported benefit type ${b['Benefit type']}. Correct the source workbook.`,true);
   if(!['monthly','per cutoff','daily','hourly'].includes(importKey(b.Frequency)))review('Reason',`Benefit row ${row}: confirm its payment frequency in the source workbook.`,true);
   if(importKey(b['Benefit type'])==='incentive'&&!b['Eligibility / proration rule'])review('Reason',`Benefit row ${row}: incentive eligibility and allocation rules are missing. Correct the source workbook.`,true);
   if(b['Effective to']||(b['Effective from']&&b['Effective from']!==p['Effective from']))review('Effective from',`Benefit row ${row}: benefit dates differ from the salary package; review the effective period in the individual builder.`,true);
   return {'Component name':b['Category / description']||b['Benefit type'],Amount:(b['Amount PHP']||'').replace(/,/g,''),Frequency:'recurring','Pay frequency':b.Frequency||'','Payable date':'','Legacy field':importKey(b['Benefit type'])==='de minimis'?'deminimis':importKey(b['Benefit type'])==='reimbursement'?'reimbursable':'','Component type':types[importKey(b['Benefit type'])]||'Other approved component','Tax treatment detail':'pending','Receipt required':importKey(b['Benefit type'])==='reimbursement'?'Yes':'No','Receipt or document reference':'','Policy reference':b['Tax treatment / policy reference']||'',Notes:[b['Eligibility / proration rule'],b['Approval / PAN reference'],b['Owner / notes']].filter(Boolean).join(' ')};
  });
  return {row:column,values,components,issues};
 });
 const consultant=sheetFor(workbook,'04 Consultant');
 if(consultant)for(const {column,values:c} of columns(consultant,'Employee ID / payee ID')){
  const profile=profileFor(c['Employee ID / payee ID']);
  const values=Object.fromEntries(packageHeaders.map(header=>[header,'']));
  Object.assign(values,{'Package key':c['Consultant attachment ID']||`CONSULTANT-${column}`,'Employee code':profile?.['Employee ID']||c['Employee ID / payee ID'],'Employee name':c['Payee legal name / entity'],'Business unit / payroll group':profile?.['Business unit']||'','Pay stream':'professional_fee','Effective from':c['Effective from / to'],'Amount unit':c['Fee basis'],'Basic pay / fee amount':(c['Fee amount (PHP)']||'').replace(/,/g,''),'Salary source':'Consultant agreement','Source reference':c['Contract / authorization link'],Reason:c['Services / deliverables'],'Engagement reference':c['Contract / authorization link'],'Tax profile reference':c['Applicable withholding policy'],'Salary arrangement':'Custom - needs review','Arrangement document':c['Contract / authorization link'],Notes:['Separate consultant fee',c['Gross / net fee terms'],c['Relationship / classification review']].filter(Boolean).join('; ')});
  for(const [field,value] of Object.entries(values))values[field]=value??'';
  imports.push({row:packages.columnCount+column,values,components:[]});
 }
 // Surface orphan benefits as blocked rows so the rest of the file can still be
 // reviewed. They cannot become an invented salary or disappear from the preview.
 const orphanCodes=[...new Set(benefits.filter(benefit=>!imports.some(item=>item.values['Pay stream']==='employee_payroll'&&codeKey(item.values['Employee code'])===codeKey(benefit.code))).map(benefit=>benefit.code))];
 for(const code of orphanCodes){
  const profile=profileFor(code),related=benefits.filter(benefit=>codeKey(benefit.code)===codeKey(code));
  const values=Object.fromEntries(packageHeaders.map(header=>[header,'']));
  Object.assign(values,{'Package key':`ORPHAN-BENEFIT-${related[0].row}`,'Employee code':profile?.['Employee ID']||code,'Business unit / payroll group':profile?.['Business unit']||'','Pay stream':'employee_payroll','Salary source':'Current HRIS record','Source reference':`03 Benefits rows ${related.map(item=>item.row).join(', ')}`,Reason:'Benefit rows have no matching salary package',Notes:JSON.stringify(related.map(item=>item.values))});
  imports.push({row:packages.columnCount+(consultant?.columnCount||0)+related[0].row,values,components:[],issues:[{field:'Basic pay / fee amount',value:'',message:`Needs review: 03 Benefits has no matching salary package for ${code}. Add the actual package or correct the benefit employee code.`}]});
 }
 if(!imports.length)throw new Error('Completion workbook has no employee packages or consultant arrangements. Examples are not imported.');
 if(imports.length>1000)throw new Error('Completion workbook: maximum 1,000 arrangements.');
 return imports;
}

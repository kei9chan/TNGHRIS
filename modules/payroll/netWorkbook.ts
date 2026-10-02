import type {Workbook,CellValue} from 'exceljs';
import {arrangementLabel,contributionKeys,NetInputs,NetWorkspace,Loan,NetEmployee} from './netPay';
import {importNetWorkbook as importLegacy} from './netWorkbookLegacy';

const colors={navy:'17365D',blue:'E8F1FC',yellow:'FFF2CC',green:'E2F0D9',orange:'FCE4D6',white:'FFFFFF',gray:'64748B'};
const money='#,##0.00;[Red](#,##0.00);0.00';
type Column={key:string;label:string;width?:number;auto?:boolean;hidden?:boolean;help?:string;choices?:string[];cash?:boolean};
const identity:Column[]=[{key:'employeeId',label:'HRIS key',hidden:true,auto:true},{key:'employeeName',label:'Employee',width:30,auto:true}];
const contributions:Column[]=[...identity,
 ...['sss','philhealth','pagibig'].map(k=>({key:k+'Base',label:({sss:'SSS',philhealth:'PhilHealth',pagibig:'Pag-IBIG'}[k])+' monthly salary base (PHP)',cash:true,help:'Monthly compensation subject to this contribution, not the deduction amount. Use approved compensation and applicable coverage rules.'})),
 ...['sss','philhealth','pagibig'].map(k=>({key:k+'Covered',label:({sss:'SSS',philhealth:'PhilHealth',pagibig:'Pag-IBIG'}[k])+' covered?',choices:['yes','no']})),
 {key:'coverageRef',label:'If not covered: authority',width:32},
 {key:'sourceRef',label:'Basis / benefits source',width:38}];
const history:Column[]=[...identity,{key:'openingTaxable',label:'Earlier taxable pay this year (PHP)',cash:true},{key:'openingWithheld',label:'Earlier tax withheld this year (PHP)',cash:true},{key:'openingPeriods',label:'Earlier semi-monthly payrolls (0–23)'},{key:'previousEmployer',label:'Previous employer this year?',choices:['yes','no']},{key:'cumulativeAlready',label:'Cumulative tax method already used?',choices:['yes','no']},{key:'openingRef',label:'Opening records checked / reference',width:44}];
const month:Column[]=[...identity,...contributionKeys.map(k=>({key:k,label:({sssEE:'SSS employee',sssER:'SSS employer',mpfEE:'SSS pension fund employee',mpfER:'SSS pension fund employer',ecER:'Employees compensation employer',philhealthEE:'PhilHealth employee',philhealthER:'PhilHealth employer',pagibigEE:'Pag-IBIG employee',pagibigER:'Pag-IBIG employer'}[k])+' paid earlier this month (PHP)',cash:true}))];
const earnings:Column[]=[{key:'groupId',label:'HRIS group',hidden:true,auto:true},{key:'employeeName',label:'Employee',auto:true,width:30},{key:'label',label:'Type of pay already calculated',auto:true,width:42},{key:'gross',label:'Pay amount (PHP)',auto:true,cash:true},{key:'taxable',label:'Amount subject to tax (PHP)',cash:true,help:'This is earnings subject to tax, not the tax deduction. Full taxable: copy Pay amount. Fully exempt: enter 0 and the exemption reference. HRIS calculates withholding.'},{key:'kind',label:'Tax category',choices:['regular','supplement'],help:'regular = fixed/basic compensation; supplement = additional compensation such as OT. Check applicable classification.'},{key:'exemptionRef',label:'If exempt: legal basis / limit checked',width:44},{key:'status',label:'What to do',auto:true,width:42}];
const deductionColumns:Column[]=[{key:'employeeName',label:'Employee',width:30},{key:'label',label:'Deduction description',width:30},{key:'amount',label:'Amount this cutoff (PHP)',cash:true},{key:'sourceRef',label:'Signed authority / reference',width:38},{key:'kind',label:'Deduction category',choices:['legal','voluntary']},{key:'carryForward',label:'Carry unpaid amount forward?',choices:['yes','no']},{key:'voluntaryPercent',label:'Voluntary ceiling % (optional)'},{key:'higherDeductionAuthorization',label:'Higher ceiling: authority (optional)'},{key:'higherDeductionLegalBasis',label:'Higher ceiling: legal basis (optional)'}];
const loanColumns:Column[]=[{key:'employeeName',label:'Employee',width:30},{key:'account_ref',label:'Loan account reference',width:30},{key:'as_of',label:'Balance date (YYYY-MM-DD)',width:26},{key:'balance',label:'Outstanding balance (PHP)',cash:true},{key:'installment',label:'Installment per cutoff (PHP)',cash:true},{key:'source_ref',label:'Approved balance / authority',width:40}];
const bools=new Set(['sssCovered','philhealthCovered','pagibigCovered','previousEmployer','cumulativeAlready']);
function plain(v:unknown):string{if(v==null)return '';if(['string','number','boolean'].includes(typeof v))return String(v).trim();throw new Error('Use plain values, not formulas or links. Enter dates as YYYY-MM-DD text.');}
function cents(v:string):bigint{if(!/^-?\d+(\.\d{1,2})?$/.test(v))throw new Error('Enter PHP amounts as numbers with at most two decimals.');const neg=v.startsWith('-');const [a,b='']=v.replace('-','').split('.');const n=BigInt(a)*100n+BigInt(b.padEnd(2,'0'));return neg?-n:n;}
const cash=(n:bigint)=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
const fill=(argb:string)=>({type:'pattern' as const,pattern:'solid' as const,fgColor:{argb}});
function sheet(book:Workbook,name:string,cols:Column[],note:string,rows:Record<string,unknown>[]){
 const s=book.addWorksheet(name,{properties:{tabColor:{argb:cols.every(c=>c.auto)?colors.blue:colors.yellow}}});
 s.addRow(cols.map(c=>c.key));s.getRow(1).hidden=true;s.addRow([note]);s.mergeCells(2,1,2,cols.length);s.getRow(2).height=46;s.getCell('A2').alignment={wrapText:true,vertical:'middle'};s.getCell('A2').fill=fill(colors.green);s.getCell('A2').font={bold:true,size:11};
 s.addRow(cols.map(c=>c.label));s.getRow(3).height=56;
 cols.forEach((c,i)=>{const col=s.getColumn(i+1);col.width=c.width||22;col.hidden=!!c.hidden;const h=s.getRow(3).getCell(i+1);h.fill=fill(colors.navy);h.font={bold:true,color:{argb:colors.white}};h.alignment={wrapText:true,vertical:'middle',indent:1};h.note=c.help|| (c.auto?'HRIS figure — keep unchanged.':'Finance input — enter the checked value.');});
 rows.forEach(r=>{const row=s.addRow(cols.map(c=>typeof r[c.key]==='boolean'?(r[c.key]?'yes':'no'):r[c.key]===''?null:r[c.key]??null) as CellValue[]);row.height=42;cols.forEach((c,j)=>{const cell=row.getCell(j+1);cell.fill=fill(c.auto?colors.blue:colors.yellow);cell.font={name:'Calibri',size:11,color:{argb:c.auto?'17365D':'000000'}};cell.alignment={wrapText:true,vertical:'middle',indent:1};cell.protection={locked:!!c.auto};if(c.cash){cell.numFmt=money;if(plain(cell.value)!=='')cell.value=Number(plain(cell.value));}if(c.choices)cell.dataValidation={type:'list',allowBlank:true,formulae:['"'+c.choices.join(',')+'"'],showErrorMessage:true,error:'Choose an option from the list.'};if(c.key==='as_of')cell.numFmt='@';if(c.help)cell.note=c.help;});});
 s.views=[{state:'frozen',ySplit:3,xSplit:2,showGridLines:false}];s.autoFilter={from:{row:3,column:1},to:{row:Math.max(3,s.rowCount),column:cols.length}};
 s.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'2:3'};return s;
}
type Group={id:string;employeeId:string;employeeName:string;label:string;indexes:number[];gross:bigint;taxable:string;kind:string;ref:string;treatment:string};
function groups(w:NetWorkspace,p:NetInputs):Group[]{
 const out:Group[]=[];
 w.gross.result.employees.forEach(e=>{const row=p.employees.find(x=>x.employeeId===e.employeeId)!;const terms=w.packageTerms?.find(x=>x.employeeId===e.employeeId);const map=new Map<string,Group>();
 e.lines.forEach((l,i)=>{const tax=row.taxLines[i];const treatment=terms?.taxLines[i]?.treatment||'unreviewed';const key=JSON.stringify([l.label,treatment,cents(l.amount)<0n,tax.kind,tax.exemptionRef]);let g=map.get(key);
 if(!g){g={id:'pay-'+String(out.length+1).padStart(4,'0'),employeeId:e.employeeId,employeeName:e.employeeName,label:l.label,indexes:[],gross:0n,taxable:'0.00',kind:tax.kind||'regular',ref:tax.exemptionRef||'',treatment};map.set(key,g);out.push(g);}
 g.indexes.push(i);g.gross+=cents(l.amount);g.taxable=g.taxable!==''&&tax.taxable!==''?cash(cents(g.taxable)+cents(tax.taxable)):'';
 });});return out;
}
const employeeChoices=(w:NetWorkspace)=>w.gross.result.employees.map((e,i)=>({id:e.employeeId,label:e.employeeName+' · '+String(i+1).padStart(2,'0')}));
export async function buildNetWorkbook(w:NetWorkspace,p:NetInputs){
 const {Workbook}=await import('exceljs');const book=new Workbook();book.creator='TNG HRIS';book.title='Finance payroll review';const choices=employeeChoices(w);
 const guide=book.addWorksheet('Start here');guide.columns=[{width:31},{width:105}];
 const tips=[
 ['PAYROLL REVIEW',w.gross.from+' to '+w.gross.to],
 ['1 · Read the summary','Package summary contains approved arrangements and the calculated gross pay. Salary arrangements are already taken from approved packages.'],
 ['2 · Fill yellow cells','Contributions: monthly salary bases and coverage. Tax history: earlier payroll records. Enter 0 only when the checked record is really zero.'],
 ['3 · Review earnings','Earnings review groups basic pay, overtime and benefits. OT is already calculated. “Amount subject to tax” means taxable earnings, NOT tax payable. HRIS calculates tax.'],
 ['4 · Optional entries','Other deductions and Loan balances are only for additional authorized entries. Leave unused rows blank. Existing loan history remains in HRIS.'],
 ['5 · Import into HRIS','Save as .xlsx. Import it into the same payroll version, check the preview, and record Finance review. Examples on this page are not imported.'],
 ['BLUE = automatic','Names, approved packages and calculated pay. Keep these figures unchanged.'],
 ['YELLOW = Finance input','Editable values. Dropdowns provide yes/no and tax categories. Cell notes explain each field.'],
 ['ORANGE = needs attention','Missing amounts or conflicting approved packages. Resolve the named item; do not recreate OT or salary approvals.'],
 ['Contribution policy','SSS, PhilHealth and Pag-IBIG: 50% per cutoff. The second cutoff reconciles the monthly total less the first deduction.'],
 ['Earlier contributions','Only complete Month to date when starting on the second cutoff without a linked first payroll. Include employee AND employer shares from actual records.'],
 ['Example: taxable basic','Pay amount 10,000.00 → amount subject to tax 10,000.00 → category regular → exemption reference blank. Example only.'],
 ['Example: overtime','Pay amount 800.00 → amount subject to tax 800.00 → category supplement. OT hours/rates are already calculated. Example assumes taxable OT; check any applicable exemption.'],
 ['Example: exempt benefit','Pay amount 500.00 → amount subject to tax 0.00 → cite the applicable legal category, evidence and benefit limit checked. A benefit name alone does not establish exemption.'],
 ['Example: deduction','Choose an employee → approved cash advance → 500.00 → signed authority reference → voluntary → no carry-forward, unless separately authorized.'],
 ['Example: opening tax','Earlier taxable pay 120,000.00; tax already withheld 2,000.00; 12 earlier semi-monthly payrolls. Copy actual records, not these example values.'],
 ['Tax category reference','BIR RR 11-2018, page 27: https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2011-2018.pdf'],
 ['Keep confidential','Salary data: share only with the authorized payroll team. No bank-account or government ID numbers are needed in this file.']
 ];
 tips.forEach((r,i)=>{const row=guide.addRow(r);row.height=i===0?36:49;row.alignment={wrapText:true,vertical:'middle'};row.getCell(1).font={bold:true,color:{argb:colors.navy}};row.getCell(2).font={size:11};});
 guide.getRow(1).eachCell(c=>{c.fill=fill(colors.navy);c.font={bold:true,size:16,color:{argb:colors.white}};});[7,8,9].forEach((r,i)=>guide.getRow(r).eachCell(c=>c.fill=fill([colors.blue,colors.yellow,colors.orange][i])));guide.views=[{showGridLines:false}];
 const meta=book.addWorksheet('_version');meta.addRow(['v2',w.gross.id]);meta.state='veryHidden';
 sheet(book,'Package summary',[{key:'employeeName',label:'Employee',width:30,auto:true},{key:'gross',label:'Gross this cutoff (PHP)',cash:true,auto:true},{key:'arrangement',label:'Approved salary arrangement',width:42,auto:true},{key:'package',label:'Approved amounts / effective dates',width:65,auto:true},{key:'issue',label:'Action needed',width:65,auto:true}], 'READ ONLY · Approved packages determine salary arrangements. Calculated gross includes attendance, OT and benefits.',w.gross.result.employees.map(e=>{const t=w.packageTerms?.find(x=>x.employeeId===e.employeeId);return {employeeName:e.employeeName,gross:e.gross,arrangement:arrangementLabel(t?.payBasis||p.employees.find(x=>x.employeeId===e.employeeId)?.payBasis||'gross'),package:t?.packages.map(x=>x.effectiveFrom+' · PHP '+Number(x.baseAmount).toLocaleString()+' '+x.rateType+' · '+arrangementLabel(x.payBasis)).join('\n')||'See approved package in HRIS',issue:t?.issue||'No arrangement entry needed'};}));
 const employeeRows=p.employees.map(e=>({...e,employeeName:w.gross.result.employees.find(x=>x.employeeId===e.employeeId)?.employeeName,...e.openingContributions}));
 sheet(book,'Contributions',contributions,'YELLOW: monthly contribution salary bases, NOT deduction amounts. Approved salary arrangement is already loaded. Allocation is fixed at 50% each cutoff.',employeeRows);
 sheet(book,'Tax history',history,'YELLOW: records before this payroll. Use checked amounts; 0 is not a placeholder. A linked previous payroll supplies calculation history automatically.',employeeRows);
 sheet(book,'Month to date',month,'ONLY if this is cutoff 2 without a linked first payroll: amounts already paid this contribution month. Otherwise leave unchanged.',employeeRows);
 const summary=book.getWorksheet('Package summary')!;w.gross.result.employees.forEach((e,i)=>{summary.getRow(i+4).height=70;if(w.packageTerms?.find(t=>t.employeeId===e.employeeId)?.issue)summary.getCell(i+4,5).fill=fill(colors.orange);});
 const gs=groups(w,p);
 const es=sheet(book,'Earnings review',earnings,'OT IS ALREADY CALCULATED · Review taxable earnings here, not OT hours or tax deductions. One row per employee / pay type; daily detail is on Pay detail.',gs.map(g=>({groupId:g.id,employeeName:g.employeeName,label:g.label,gross:cash(g.gross),taxable:g.taxable,kind:g.kind,exemptionRef:g.ref,status:g.taxable===''?'Enter taxable earnings; check approved treatment':g.taxable!==cash(g.gross)&&!g.ref?'Add exemption legal basis / limit checked':'Prefilled — check before import'})));
 gs.forEach((g,i)=>{if(g.taxable===''||(g.taxable!==cash(g.gross)&&!g.ref))es.getRow(i+4).getCell(8).fill=fill(colors.orange);});
 const deductionRows=p.employees.flatMap(e=>e.deductions.map(d=>({...d,employeeName:choices.find(x=>x.id===e.employeeId)!.label,voluntaryPercent:e.voluntaryPercent||'',higherDeductionAuthorization:e.higherDeductionAuthorization||'',higherDeductionLegalBasis:e.higherDeductionLegalBasis||''})));
 const ds=sheet(book,'Other deductions',deductionColumns,'OPTIONAL · Add authorized non-loan deductions only. Blank rows mean no additional deductions. See Start here for a sample; never enter a loan here twice.',[...deductionRows,...Array.from({length:20},()=>({}))]);
 const ls=sheet(book,'Loan balances',loanColumns,'OPTIONAL · New approved opening/reconciliation balances only. These are not new loan requests. Use YYYY-MM-DD as text; see recorded loan history in HRIS.',Array.from({length:20},()=>({})));
 const options=book.addWorksheet('_employees');choices.forEach(c=>options.addRow([c.label]));options.state='veryHidden';
 [ds,ls].forEach(s=>{for(let r=4;r<=s.rowCount;r++){s.getCell(r,1).dataValidation={type:'list',allowBlank:true,formulae:["'_employees'!$A$1:$A$"+choices.length],showErrorMessage:true,error:'Choose an employee in this payroll.'};}s.views=[{state:'frozen',ySplit:3,xSplit:1,showGridLines:false}];});
 sheet(book,'Pay detail',[...identity,{key:'date',label:'Work date',auto:true},{key:'label',label:'Calculated earnings',auto:true,width:44},{key:'amount',label:'Pay (PHP)',cash:true,auto:true}], 'READ ONLY · Attendance and approved OT breakdown. No data entry. Totals flow to Earnings review.',w.gross.result.employees.flatMap(e=>e.lines.map(l=>({employeeId:e.employeeId,employeeName:e.employeeName,date:l.date||'',label:l.label,amount:l.amount}))));
 return book;
}
export async function downloadNetWorkbook(w:NetWorkspace,p:NetInputs){
 const book=await buildNetWorkbook(w,p);const data=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([data as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=`Payroll-review-${w.gross.from}-${w.gross.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function importNetWorkbook(file:File,w:NetWorkspace,current:NetInputs):Promise<{inputs:NetInputs;loans:Loan[]}>{
 if(file.size>5*1024*1024)throw new Error('Use a workbook smaller than 5 MB.');
 const {Workbook}=await import('exceljs');const book=new Workbook();await book.xlsx.load(await file.arrayBuffer());
 if(!book.getWorksheet('_version'))return importLegacy(file,w,current);
 if(plain(book.getWorksheet('_version')?.getCell('B1').value)!==w.gross.id)throw new Error('Workbook belongs to a different gross-pay version. Download a new workbook.');
 function rows(name:string,cols:Column[]){const s=book.getWorksheet(name);if(!s)throw new Error('Missing sheet: '+name);if(s.rowCount>20000)throw new Error('Too many workbook rows.');cols.forEach((c,j)=>{if(plain(s.getCell(1,j+1).value)!==c.key||plain(s.getCell(3,j+1).value)!==c.label)throw new Error('Keep the '+name+' headings unchanged.');});const out:Record<string,string>[]=[];for(let i=4;i<=s.rowCount;i++){const r=Object.fromEntries(cols.map((c,j)=>[c.key,plain(s.getCell(i,j+1).value)]));if(Object.values(r).some(Boolean))out.push(r);}return out;}
 const employees=structuredClone(current.employees);const ids=new Set(employees.map(e=>e.employeeId));
 for(const [name,cols] of [['Contributions',contributions],['Tax history',history],['Month to date',month]] as const){
  const rr=rows(name,cols);if(rr.length!==ids.size||new Set(rr.map(r=>r.employeeId)).size!==ids.size)throw new Error(name+': keep one row for every employee.');
  rr.forEach(r=>{const e=employees.find(e=>e.employeeId===r.employeeId);if(!e)throw new Error('Employee outside this payroll.');if(r.employeeName!==w.gross.result.employees.find(x=>x.employeeId===e.employeeId)?.employeeName)throw new Error('Keep employee names unchanged.');for(const c of cols){if(c.auto)continue;const v=r[c.key];if(contributionKeys.includes(c.key as typeof contributionKeys[number]))e.openingContributions[c.key]=v;
   else if(bools.has(c.key)){if(!['yes','no'].includes(v.toLowerCase()))throw new Error(name+' / '+r.employeeName+': choose yes/no for '+c.label);(e as unknown as Record<string,unknown>)[c.key]=v.toLowerCase()==='yes';}
   else (e as unknown as Record<string,unknown>)[c.key]=v;
  }});
 }
 const gs=groups(w,current),rr=rows('Earnings review',earnings);
 if(rr.length!==gs.length||new Set(rr.map(r=>r.groupId)).size!==gs.length)throw new Error('Keep every earnings group exactly once.');
 gs.forEach(g=>{const r=rr.find(r=>r.groupId===g.id);if(!r||cents(r.gross)!==g.gross||r.label!==g.label||r.employeeName!==g.employeeName)throw new Error('Calculated earnings cannot be changed. Download this payroll’s workbook.');
  if(r.taxable==='')throw new Error(g.employeeName+' / '+g.label+': enter the amount subject to tax (not the tax deduction).');
  const total=cents(r.taxable);if((g.gross>=0n&&(total<0n||total>g.gross))||(g.gross<0n&&(total>0n||total<g.gross)))throw new Error('Taxable earnings must be within the calculated pay amount.');
  if((g.treatment==='included'&&total!==g.gross)||(g.treatment==='excluded'&&total!==0n))throw new Error(g.employeeName+' / '+g.label+': keep the tax treatment in the approved pay package.');
  if(!['regular','supplement'].includes(r.kind))throw new Error('Choose regular or supplement for '+g.label);
  if(total!==g.gross&&r.exemptionRef.trim().length<3)throw new Error(g.employeeName+' / '+g.label+': enter the exemption legal basis and checked limit.');
  const e=employees.find(e=>e.employeeId===g.employeeId)!;const original=w.gross.result.employees.find(e=>e.employeeId===g.employeeId)!;
  if(g.taxable!==''&&total===cents(g.taxable)){g.indexes.forEach(i=>{e.taxLines[i]={...e.taxLines[i],kind:r.kind,exemptionRef:r.exemptionRef};});return;}
  let assigned=0n,weight=0n;g.indexes.forEach(i=>{weight+=cents(original.lines[i].amount);const cumulative=g.gross===0n?0n:total*weight/g.gross;const part=cumulative-assigned;assigned=cumulative;e.taxLines[i]={taxable:cash(part),kind:r.kind,exemptionRef:r.exemptionRef};});
 });
 const choices=employeeChoices(w);const employeeId=(label:string)=>{const match=choices.find(c=>c.label===label);if(!match)throw new Error('Choose an employee from the workbook dropdown.');return match.id;};
 employees.forEach(e=>{e.deductions=[];});
 rows('Other deductions',deductionColumns).forEach(r=>{const e=employees.find(e=>e.employeeId===employeeId(r.employeeName))!;if(!r.label||!r.sourceRef||!['legal','voluntary'].includes(r.kind)||!['yes','no'].includes(r.carryForward.toLowerCase())||cents(r.amount)<0n)throw new Error('Complete the deduction description, amount, authority, category and carry-forward choice.');e.deductions.push({label:r.label,amount:r.amount,sourceRef:r.sourceRef,kind:r.kind,carryForward:r.carryForward.toLowerCase()==='yes'});for(const k of ['voluntaryPercent','higherDeductionAuthorization','higherDeductionLegalBasis'] as const)if(r[k]){if(e[k]&&e[k]!==r[k])throw new Error('Use one consistent deduction ceiling and authority per employee.');e[k]=r[k];}});
 const accounts=new Set<string>();const loans=rows('Loan balances',loanColumns).map(r=>{const employee_id=employeeId(r.employeeName),key=employee_id+':'+r.account_ref;if(accounts.has(key))throw new Error('Only one balance entry per loan account.');accounts.add(key);if(!r.account_ref||!/^\d{4}-\d{2}-\d{2}$/.test(r.as_of)||!r.source_ref||cents(r.balance)<0n||cents(r.installment)<0n)throw new Error('Complete the loan account, date, amounts and approval reference.');return {employee_id,account_ref:r.account_ref,as_of:r.as_of,balance:r.balance,installment:r.installment,source_ref:r.source_ref};});
 return {inputs:{...current,allocation:{sss:'0.5',philhealth:'0.5',pagibig:'0.5'},employees},loans};
}

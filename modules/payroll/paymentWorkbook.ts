import ExcelJS from 'exceljs';
import type {OutputPayload} from './payments';
type Row=Record<string,unknown>;
const rows=(v:unknown):Row[]=>Array.isArray(v)?v:[];
const obj=(v:unknown):Row=>v&&typeof v==='object'?v as Row:{};
const text=(v:unknown):string=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);

// Keep monetary strings exact; never convert Postgres numeric values through a
// floating-point total. ExcelJS stores all source content as literal cell text.
export async function buildPaymentWorkbook(p:OutputPayload){
 const book=new ExcelJS.Workbook();book.creator='TNG HRIS';
 function sheet(name:string,headers:string[],data:unknown[][]){
  const s=book.addWorksheet(name);s.addRow([text(p.label)]);s.addRow(headers);
  data.forEach(r=>s.addRow(r.map(text)));s.views=[{state:'frozen',ySplit:2}];
  s.getRow(1).font={bold:true,color:{argb:'FF9A3412'}};s.getRow(2).font={bold:true};
  s.columns.forEach((c,i)=>{c.width=i===0?30:24;});s.getColumn(1).width=40;
  s.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};});return s;
 }
 const employees=rows(p.employees),review=obj(p.reviewInputs),payments=rows(p.payments);
 sheet('Read first',['Field','Recorded value'],[
  ['Export ID',p.exportId],['Generated at',p.generatedAt],['Content fingerprint',p.hash],['Approval version',p.runId],
  ['Source fingerprint',p.sourceHash],['Source current at generation',p.sourceCurrent],['Approval stage',p.approvalStage],
  ['Mode',p.mode],['Period from',p.from],['Period to',p.to],['Reviewed payday',p.payDate],['Payroll kind',p.payKind],
  ['Contribution month',p.contributionMonth],['Reporting coverage',p.reportingNote],
  ['Bank and agency format','Not a validated submission file. Use the named existing process. No transfer or filing is performed.'],
  ['Amounts','Exact PHP decimal strings. Annual and YTD columns are snapshots: do not add them across cutoff files.'],
  ['Payment evidence','Pending reserves funds. Failed/cancelled/returned attempts do not count as confirmed. Download does not mean Paid.'],
 ]);
 sheet('Finance totals',['Measure','PHP'],[['Gross',p.gross],['Employee deductions',p.deductions],['Net',p.net],['Employer shares',p.employer],['Confirmed payments',obj(p.totals).confirmed],['Pending attempts',obj(p.totals).pending],['Unpaid',obj(p.totals).unpaid]]);
 if(['register','finance','tax','agency'].includes(text(p.kind))){
  sheet('Register',['Employee ID','Employee','Gross','Deductions','Net','Withholding','Employer shares'],employees.map(e=>[e.employeeId,e.employeeName,e.gross,e.deductions,e.net,e.tax,e.employer]));
  sheet('Earnings and adjustments',['Employee','Source / line','Category','Amount','Previously settled','Remaining','Taxable','Source reference'],employees.flatMap(e=>rows(e.lines).map(l=>[e.employeeName,l.label,l.kind||l.category,l.amount,l.settled,l.remaining,l.taxable,l.sourceRef])));
  sheet('Employee deductions',['Employee','Type','Label / account','Amount','Deferred','Source reference'],employees.flatMap(e=>[
   ...rows(e.loans).map(l=>[e.employeeName,'Loan',l.account,l.amount,l.deferred,l.sourceRef]),
   ...rows(e.otherDeductions).map(l=>[e.employeeName,'Other',l.label,l.amount,l.deferred,l.sourceRef]),
  ]));
 }
 if(['agency','finance','register'].includes(text(p.kind))){
  sheet('SSS PH HDMF source',['Employee','Share','This cutoff','Monthly due','Earlier cutoff'],employees.flatMap(e=>rows(e.contributions).map(c=>[e.employeeName,c.label,c.amount,c.monthly,c.prior])));
  sheet('Contribution allocation',['Source setting','Value'],[['Contribution month',review.contributionMonth],['Cutoff',review.cutoff],['First-cutoff allocation',review.allocation],['Previous run',review.previousRunId],['Reviewed sources',review.sourceRef]]);
 }
 if(['tax','finance','register'].includes(text(p.kind))){
  sheet('BIR 1601-C source',['Employee','Gross','Withholding this version','Mandatory EE','Tax explanation','Taxable YTD snapshot','Withheld YTD snapshot'],employees.map(e=>[e.employeeName,e.gross,e.tax,e.mandatory,e.taxExplanation,obj(e.ytd).taxable,obj(e.ytd).withheld]));
  sheet('BIR 1604-C 2316 source',['Employee ID','Imported taxable opening','Imported withheld opening','Opening periods','Opening reference','Reviewed source'],rows(review.employees).map(e=>[e.employeeId,e.openingTaxable,e.openingWithheld,e.openingPeriods,e.openingRef,e.sourceRef]));
  sheet('Tax treatment source',['Employee ID','Line index','Taxable','Classification','Exemption / limit reference'],rows(review.employees).flatMap(e=>rows(e.taxLines).map((l,i)=>[e.employeeId,i+1,l.taxable,l.kind,l.exemptionRef])));
  if(p.payKind!=='regular')sheet('Special pay review',['Input','Reviewed value'],Object.entries(review));
 }
 sheet('Payment reconciliation',['Employee ID','Employee','Approved net','Confirmed','Pending','Unpaid','Available to schedule'],payments.map(e=>[e.employeeId,e.employeeName,e.due,e.confirmed,e.pending,e.unpaid,e.available]));
 sheet('Payment attempts',['Reference','Employee ID','Amount','Scheduled date','Status','Reissue of','Outcome evidence'],rows(p.attempts).map(a=>[a.reference,a.employee_id,a.amount,a.scheduled_on,a.status,a.reissue_of,a.events]));
 if(p.bankVerification)sheet('Verified payment details',['Employee ID','Bank','Account suffix','Verification ID'],rows(p.bankVerification).map(b=>[b.employeeId,b.bankName,b.last4,b.verificationId]));
 sheet('Existing filing processes',['Output','Finance owner','Process / approval reference'],rows(p.processes).map(x=>[x.code,x.owner,x.process_ref]));
 return book;
}
export async function savePaymentWorkbook(p:OutputPayload){
 const book=await buildPaymentWorkbook(p);const data=await book.xlsx.writeBuffer();
 const blob=new Blob([data as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
 a.download=`${p.kind==='payment_schedule'?'AUTHORIZED-SCHEDULE':'INTERNAL-WORKPAPER'}-${text(p.kind)}-${text(p.exportId)}.xlsx`;
 a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

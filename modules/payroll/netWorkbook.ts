import {contributionKeys,NetInputs,NetWorkspace,Loan,NetEmployee} from './netPay';
// Workbook import fills a review only. The caller must explicitly record it afterwards.
const fields=['employeeId','employeeName','sssBase','philhealthBase','pagibigBase','sssCovered','philhealthCovered','pagibigCovered','coverageRef','openingTaxable','openingWithheld','openingPeriods','previousEmployer','cumulativeAlready','sourceRef','openingRef',...contributionKeys] as const;
const booleanFields=['sssCovered','philhealthCovered','pagibigCovered','previousEmployer','cumulativeAlready'];
const loanFields=['employee_id','account_ref','as_of','balance','installment','source_ref'];
export async function downloadNetWorkbook(w:NetWorkspace,p:NetInputs){
 const {Workbook}=await import('exceljs');const book=new Workbook();
 const guide=book.addWorksheet('Instructions');[
 ['Gross version',w.gross.id],['Purpose','Finance review for shadow payroll. No payment or real loan deduction is created.'],
 ['Employee review','Enter reviewed MONTHLY contribution bases, explicit yes/no coverage and tax-history flags, and opening YTD amounts/periods. Use 0 only when confirmed. A linked prior net review supplies subsequent YTD.'],
 ['References','sourceRef: approved contribution bases, benefits and applicable rules. openingRef: checked YTD including previous employers, benefit-limit usage and loan/deduction completeness.'],
 ['Tax lines','Keep every employeeId and zero-based lineIndex. Enter taxable portion with the same sign as gross and kind regular/supplement. Non-taxable portions need exemptionRef including legal category and applicable limit/usage reconciliation. Do not infer exemption from allowance names.'],
 ['Second cutoff','With no linked first cutoff, enter all nine already-deducted month-to-date employee/employer contribution amounts and cite the approved imported record in openingRef.'],
 ['Loan balances','Optional separate approved opening/reconciliation entries. as_of YYYY-MM-DD, balance and installment in PHP. Existing balance history is on screen. Blank rows mean no new balance entry, not no outstanding loans.'],
 ['Other deductions','Enter only authorized non-loan deductions. An empty sheet confirms none for this cutoff. Priority under approved deferral: loan account order first, then worksheet deduction order.'],
 ['Dates / policy','Set payday, contribution month, cutoff allocation, prior run and policy reference on screen after import.'],
 ['Privacy','This workbook contains salary information. Keep it within the authorized payroll team. Do not add full bank or statutory ID numbers.']].forEach(r=>guide.addRow(r));
 guide.getColumn(1).width=24;guide.getColumn(2).width=110;
 const employees=book.addWorksheet('Employee review');employees.addRow([...fields]);
 for(const e of p.employees){const name=w.gross.result.employees.find(x=>x.employeeId===e.employeeId)?.employeeName||'';employees.addRow(fields.map(k=>k==='employeeName'?name:contributionKeys.includes(k as typeof contributionKeys[number])?e.openingContributions[k]:typeof e[k as keyof NetEmployee]==='boolean'?(e[k as keyof NetEmployee]?'yes':'no'):e[k as keyof NetEmployee] as string));}
 const lines=book.addWorksheet('Tax lines');lines.addRow(['employeeId','employeeName','lineIndex','label','gross','taxable','kind','exemptionRef']);
 w.gross.result.employees.forEach(e=>e.lines.forEach((l,i)=>{const a=p.employees.find(x=>x.employeeId===e.employeeId)?.taxLines[i];lines.addRow([e.employeeId,e.employeeName,i,l.label,l.amount,a?.taxable||'',a?.kind||'',a?.exemptionRef||'']);}));
 const deductions=book.addWorksheet('Other deductions');deductions.addRow(['employeeId','label','amount','sourceRef']);p.employees.forEach(e=>e.deductions.forEach(d=>deductions.addRow([e.employeeId,d.label,d.amount,d.sourceRef])));
 const loans=book.addWorksheet('Loan balances');loans.addRow(loanFields);
 [employees,lines,deductions,loans].forEach(s=>{s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true};s.columns.forEach(c=>{c.width=24;});});
 const data=await book.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([data as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`Payroll-review-${w.gross.from}-${w.gross.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function importNetWorkbook(file:File,w:NetWorkspace,current:NetInputs):Promise<{inputs:NetInputs;loans:Loan[]}>{
 if(file.size>5*1024*1024)throw new Error('Use a review workbook smaller than 5 MB.');
 const {Workbook}=await import('exceljs');const book=new Workbook();await book.xlsx.load(await file.arrayBuffer());
 function value(v:unknown):string{if(v==null)return '';if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v).trim();throw new Error('Use plain values, not formulas, links or date cells. Enter dates as YYYY-MM-DD text.');}
 if(value(book.getWorksheet('Instructions')?.getCell('B1').value)!==w.gross.id)throw new Error('Workbook belongs to a different gross-pay version. Download this version’s template.');
 function rows(name:string,headers:readonly string[]){const sheet=book.getWorksheet(name);if(!sheet)throw new Error(`Missing sheet: ${name}`);if(sheet.rowCount>20000)throw new Error('Workbook contains too many rows.');headers.forEach((h,i)=>{if(value(sheet.getRow(1).getCell(i+1).value)!==h)throw new Error(`Keep the ${name} column headings unchanged.`);});const out:Record<string,string>[]=[];for(let i=2;i<=sheet.rowCount;i++){const row=Object.fromEntries(headers.map((h,j)=>[h,value(sheet.getRow(i).getCell(j+1).value)]));if(Object.values(row).some(Boolean))out.push(row);}return out;}
 const employeeRows=rows('Employee review',fields);const taxRows=rows('Tax lines',['employeeId','employeeName','lineIndex','label','gross','taxable','kind','exemptionRef']);const deductionRows=rows('Other deductions',['employeeId','label','amount','sourceRef']);const loanRows=rows('Loan balances',loanFields);
 const ids=new Set(w.gross.result.employees.map(e=>e.employeeId));const seen=new Set<string>();
 if(employeeRows.length!==ids.size)throw new Error('Keep exactly one employee review row for every employee.');
 const employees=employeeRows.map(row=>{if(!ids.has(row.employeeId)||seen.has(row.employeeId))throw new Error('Unknown or duplicate employee review.');seen.add(row.employeeId);const e={...row,openingContributions:Object.fromEntries(contributionKeys.map(k=>[k,row[k]])),taxLines:[],deductions:[]} as unknown as NetEmployee;
 for(const k of booleanFields){if(!['yes','no'].includes(row[k].toLowerCase()))throw new Error(`Enter yes/no for ${k} (${row.employeeName}).`);(e as unknown as Record<string,unknown>)[k]=row[k].toLowerCase()==='yes';}
 const original=w.gross.result.employees.find(x=>x.employeeId===row.employeeId)!;const entries=taxRows.filter(x=>x.employeeId===row.employeeId);if(entries.length!==original.lines.length)throw new Error(`Keep every gross line for ${row.employeeName}.`);
 e.taxLines=original.lines.map((l,i)=>{const match=entries.filter(x=>x.lineIndex===String(i));if(match.length!==1)throw new Error(`Missing/duplicate tax line for ${row.employeeName}.`);const a=match[0];if(a.gross!==l.amount)throw new Error('Gross amounts cannot be changed in the tax workbook.');return {taxable:a.taxable,kind:a.kind,exemptionRef:a.exemptionRef};});
 e.deductions=deductionRows.filter(d=>d.employeeId===row.employeeId).map(d=>({label:d.label,amount:d.amount,sourceRef:d.sourceRef}));return e;});
 if([...taxRows,...deductionRows].some(r=>!ids.has(r.employeeId))||loanRows.some(r=>!ids.has(r.employee_id)))throw new Error('Workbook contains an employee outside this gross-pay version.');
 const accounts=new Set<string>();for(const l of loanRows){const key=`${l.employee_id}:${l.account_ref}`;if(accounts.has(key))throw new Error('Only one opening/reconciliation per loan account per import.');accounts.add(key);}
 return {inputs:{...current,employees},loans:loanRows.map(l=>({employee_id:l.employee_id,account_ref:l.account_ref,as_of:l.as_of,balance:l.balance,installment:l.installment,source_ref:l.source_ref}))};
}

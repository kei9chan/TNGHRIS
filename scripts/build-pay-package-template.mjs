import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const out=process.argv[2];if(!out)throw new Error('Pass the output directory. Run with CODEX_PRIMARY_RUNTIME_NODE from an artifact-tool-enabled temporary directory.');
const headers=['Employee code','Business unit','Pay type','Effective date','Amount unit','Approved basic pay / fee','Existing de minimis','Existing reimbursable','Salary arrangement','Agreed net amount','Arrangement document','Tax treatment','Exemption / tax basis',...[1,2,3].flatMap(i=>[`Extra ${i} name`,`Extra ${i} amount`,`Extra ${i} frequency`,`Extra ${i} payable date`]),'Salary source','PAN ID (if applicable)','Source document / note','Reason for this record','Consultant agreement','Consultant tax document'];
const wb=Workbook.create();const input=wb.worksheets.add('Pay Input'),examples=wb.worksheets.add('Examples'),guide=wb.worksheets.add('Guide');
const mode=['Gross salary','Company pays income tax','Company pays income tax and employee contributions','Custom - needs review'];
const tax=['Normal tax calculation','Exemption requested - evidence required','Custom - needs review'];
const bus=['The Fun Roof','The Dessert Museum','Gootopia SM North Edsa','Bakebe - S Maison','Bakebe - SM Aura','Gootopia - SM MOA','Inflatable Island Beach Club','TNG (Corporation)'];
const fields=wb.worksheets.add('Field Guide');
const extra=['Meal allowance','Transportation allowance','Communication allowance','Project completion fee'];
const date=new Date('2026-09-01T00:00:00Z');
function sample(code,type,base,arrangement,target,extraName='',extraAmount=null){return [code,'The Fun Roof',type,date,'Monthly',base,0,0,arrangement,target,arrangement===mode[0]?'':'Approved agreement / sample only',tax[0],'',extraName,extraAmount,extraName?'Recurring':'','',...Array(8).fill(''),type==='Consultant fee'?'Approved consultant agreement':'Current HRIS record','','Replace with actual document','Example only - replace with approved facts',type==='Consultant fee'?'CONSULTING-SAMPLE-003':'',type==='Consultant fee'?'REVIEWED-TAX-SAMPLE-003':''];}
const rows=[sample('TNG-EXAMPLE-001','Employee salary',25000,mode[0],null,'Meal allowance',1000),sample('TNG-EXAMPLE-002','Employee salary',30000,mode[1],30000),sample('TNG-EXAMPLE-003','Employee salary',30000,mode[2],30000),sample('TNG-EXAMPLE-004','Employee salary',30000,mode[0],null),sample('TNG-EXAMPLE-004','Consultant fee',15000,mode[0],null,'Project completion fee',5000)];
rows[4][15]='One time';rows[4][16]=new Date('2026-12-15T00:00:00Z');
for(const s of [input,examples]){
 const count=s===input?101:6;
 s.getRangeByIndexes(0,0,1,headers.length).values=[headers];
 s.getRangeByIndexes(0,0,count,headers.length).format={columnWidth:24,rowHeight:32,font:{name:'Calibri',size:11}};
 s.getRangeByIndexes(0,0,1,headers.length).format={rowHeight:58,wrapText:true,fill:'#3730A3',font:{bold:true,color:'#FFFFFF'}};
 for(const [start,len,color] of [[6,2,'#0F766E'],[8,5,'#4338CA'],[13,12,'#0F766E'],[25,6,'#475569']])s.getRangeByIndexes(0,start,1,len).format.fill=color;
 s.getRangeByIndexes(1,0,count-1,headers.length).format.font.color='#2563EB';
 s.freezePanes.freezeRows(1);s.freezePanes.freezeColumns(1);s.showGridLines=true;
 for(const name of ['Business unit','Salary arrangement','Arrangement document','Tax treatment','Exemption / tax basis','Source document / note','Reason for this record','Consultant agreement','Consultant tax document'])s.getRangeByIndexes(0,headers.indexOf(name),count,1).format.columnWidth=name==='Salary arrangement'?49:34;
 for(const name of ['Approved basic pay / fee','Existing de minimis','Existing reimbursable','Agreed net amount',...([1,2,3].map(i=>`Extra ${i} amount`))])s.getRangeByIndexes(1,headers.indexOf(name),count-1,1).setNumberFormat('#,##0.00');
 for(const name of ['Effective date',...([1,2,3].map(i=>`Extra ${i} payable date`))])s.getRangeByIndexes(1,headers.indexOf(name),count-1,1).setNumberFormat('yyyy-mm-dd');
 const lists={'Business unit':bus,'Pay type':['Employee salary','Consultant fee'],'Amount unit':['Monthly','Daily','Hourly'],'Salary arrangement':mode,'Tax treatment':tax,'Salary source':['Current HRIS record','Approved PAN','Approved consultant agreement'],'Reason for this record':['Initial setup','Approved salary change','New consulting engagement','Correction - review individually']};
 for(const i of [1,2,3]){lists[`Extra ${i} name`]=extra;lists[`Extra ${i} frequency`]=['Recurring','One time'];}
 for(const [name,values] of Object.entries(lists))s.getRangeByIndexes(1,headers.indexOf(name),count-1,1).dataValidation={rule:{type:'list',values}};
}
examples.getRangeByIndexes(1,0,rows.length,headers.length).values=rows;
examples.getRangeByIndexes(1,0,rows.length,headers.length).format={fill:'#FEF3C7',font:{color:'#92400E'},rowHeight:62,wrapText:true};
const fieldHelp={
'Employee code':['Required','Copy from Employee codes you can access on the upload page. Do not invent an ID. Missing employee? Register in HRIS first.','TNG-EXAMPLE-001 (example only)'],
'Business unit':['Required dropdown','Choose the employee payroll group exactly as listed.','The Fun Roof'],
'Pay type':['Required dropdown','Employee salary; a separate consulting engagement needs another row.','Employee salary'],
'Effective date':['Required date','Actual approved start date of this pay arrangement, not automatically the hire date.','2026-09-01'],
'Amount unit':['Required dropdown','Basis of the approved amount. Daily/hourly is not monthly salary.','Monthly'],
'Approved basic pay / fee':['Required amount','Copy approved basic pay from HRIS/PAN. Do not replace it with guessed gross-up.','25000'],
'Existing de minimis':['If recorded in HRIS','Must exactly match the existing approved allowance; do not repeat under Extras.','1500 (example only)'],
'Existing reimbursable':['If recorded in HRIS','Must exactly match HRIS/PAN; blank means none in this upload.','1000 (example only)'],
'Salary arrangement':['Required dropdown','Gross salary = employee deductions apply. Company pays income tax = tax covered only. Company pays income tax and employee contributions = both covered.','Choose the approved arrangement'],
'Agreed net amount':['Net arrangements only','Approved target for this payment unit. Tax-only target is before employee contributions; tax-plus-contributions target is after both, before loans/other deductions.','30000 (example only)'],
'Arrangement document':['Net/custom only','Approved JO, PAN or signed agreement explicitly stating net terms. Enter title/reference and date. A generic JO without net terms is insufficient.','Approved JO for [employee], [date], section [x] confirming tax coverage'],
'Tax treatment':['Dropdown; blank = normal','Choose Normal tax calculation even when company pays tax. Exemption requires a genuine separate basis and evidence.','Normal tax calculation'],
'Exemption / tax basis':['Only exemption/custom','Actual supporting basis and document; do not use net salary as the basis.','Leave blank for normal tax calculation'],
'Salary source':['Required dropdown','Where approved salary comes from.','Current HRIS record'],
'PAN ID (if applicable)':['Approved PAN only','Copy actual PAN record ID from HRIS; otherwise leave blank.','Leave blank for Current HRIS record'],
'Source document / note':['Optional descriptive text','Actual source reference. Blank uses Salary source.','Current HRIS record checked on [date]'],
'Reason for this record':['Required dropdown or text','Why this package is being recorded.','Initial setup'],
'Consultant agreement':['Consultant row only','Actual distinct consulting engagement reference, not employee salary agreement.','Signed consulting agreement [reference/date]'],
'Consultant tax document':['Consultant row only','Actual reviewed consultant withholding/tax-profile reference.','Finance-reviewed tax profile [reference]']
};
for(const i of [1,2,3]){fieldHelp[`Extra ${i} name`]=['Optional dropdown or custom','Name an additional approved component. Do not repeat existing allowances.','Meal allowance'];fieldHelp[`Extra ${i} amount`]=['When Extra name is filled','Approved component amount.','1000 (example only)'];fieldHelp[`Extra ${i} frequency`]=['Dropdown','Recurring uses the package amount unit. One time requires a payable date.','Recurring'];fieldHelp[`Extra ${i} payable date`]=['One time only','Approved payment date. Leave blank for recurring.','2026-12-15'];}
const fieldRows=[['Field name','When to fill','What to enter','Example / choice'],...headers.map(h=>[h,...fieldHelp[h]])];
fields.getRange(`A1:D${fieldRows.length}`).values=fieldRows;
fields.getRange(`A1:D${fieldRows.length}`).format={rowHeight:76,wrapText:true,font:{name:'Calibri',size:11}};
for(const [col,width] of [['A',30],['B',24],['C',75],['D',48]])fields.getRange(`${col}1:${col}${fieldRows.length}`).format.columnWidth=width;
fields.getRange('A1:D1').format={fill:'#3730A3',font:{bold:true,color:'#FFFFFF'}};
fields.freezePanes.freezeRows(1);
const info=[
 ['PAY INPUT — FILL ONE TAB ONLY','How to use this workbook'],
 ['START HERE','Fill Pay Input only. Field Guide explains EVERY field and gives exact choices/examples. Use Examples as a guide; replace sample details with approved facts. Upload on Payroll → Pay Packages, review the preview, then save drafts. Never relabel a net agreement as Gross.'],
 ['1. Use Pay Input','One continuous row contains employee, salary, net/gross agreement and allowances. No package keys. Examples and this Guide are NOT imported.'],
 ['2. Approved basic pay / fee','Copy the amount and unit from Current HRIS / approved PAN or consultant agreement. Do not change approved basic salary to a guessed gross-up.'],
 ['3. Existing allowances','Enter the existing HRIS de minimis and reimbursable amounts in their own columns. They must match the source; a de minimis name alone does not make it tax exempt.'],
 ['4. Extra allowances','Extra 1–3 are optional. Choose a suggested name or type a custom name and amount. Recurring uses the package amount unit. One time needs a payable date. Do not repeat existing allowances here.'],
 ['5. Gross salary','Agreed amount is before employee contributions and withholding. Leave Agreed net amount blank. Employer statutory shares are always separate company costs.'],
 ['6. Net — covers tax','Company funds enough additional taxable compensation to meet the target before employee statutory shares. Employee shares and other authorized deductions still reduce payout.'],
 ['7. Net — covers tax + shares','Company funds enough additional taxable compensation to meet the target after tax and employee statutory shares, before loans and other deductions.'],
 ['8. Agreed net amount','Enter the approved target in the Amount unit of this row, separately from approved basic pay. Give the agreement reference. Finance reviews the target for each cutoff, including attendance and included allowances.'],
 ['9. Tax exemption','Use Exemption requested only with legal basis and evidence. HR/Finance must classify applicable amounts and limits. Net salary does NOT exempt someone from tax. Custom rules are not automatically calculated.'],
 ['10. Dual employee + consultant','Use the same employee code in two rows: Employee salary and Consultant fee. Give the consultant agreement and tax document on the consultant row. Contractor withholding remains separate. See the last two example rows.'],
 ['11. Documents, not invented IDs','Type a real agreement/PAN/document reference or descriptive source note. Only PAN ID requires the actual approved HRIS PAN UUID; leave it blank for Current HRIS.'],
 ['12. Dropdowns and custom text','Dropdowns suggest common choices. You may type custom allowance names, notes and document references. Employee codes and BUs must match HRIS. For different salary/tax rules choose Custom - needs review and document the terms.'],
 ['13. Import and check','Payroll → Pay Packages → upload. Check every preview row before Save drafts. Importing neither approves pay nor releases payment. Old two-tab workbooks are still supported.'],
 ['14. Employer cost','Total company payroll cost = gross compensation (including company-funded gross-up) + employer statutory shares. Do not add withholding or employee contributions again; those are already inside gross.'],
 ['15. Finance net calculation','Finance must confirm final monthly statutory bases including the applicable treatment of gross-up. Net calculation uses those reviewed bases and the reviewed BIR/YTD method. Recalculate if bases change; unsupported FBT cases need separate review.'],
 ['BIR withholding table','https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf'],
 ['BIR tax / exemption rules','https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf'],
 ['SSS contribution schedule','https://www.sss.gov.ph/sss-contribution-table/'],
 ['PhilHealth employer procedure','https://www.philhealth.gov.ph/partners/employers/pay_procedures.php']];
guide.getRange(`A1:B${info.length}`).values=info;guide.getRange(`A1:B${info.length}`).format={rowHeight:56,wrapText:true,font:{name:'Calibri',size:11}};guide.getRange(`A1:A${info.length}`).format.columnWidth=32;guide.getRange(`B1:B${info.length}`).format.columnWidth=110;guide.getRange('A1:B1').format={fill:'#3730A3',font:{bold:true,color:'#FFFFFF'}};
await fs.mkdir(out,{recursive:true});
for(const [s,ranges] of [[input,['A1:H5','I1:M5','N1:Q5','Z1:AE5']],[examples,['A1:H6','I1:M6','N1:Q6','Z1:AE6']],[guide,[`A1:B${info.length}`]],[fields,['A1:D12','A13:D24','A25:D32']]])for(const [n,range] of ranges.entries()){const blob=await wb.render({sheetName:s.name,range,scale:1});await fs.writeFile(`${out}/easy-${s.name.replaceAll(' ','-')}-${n}.png`,new Uint8Array(await blob.arrayBuffer()));}
console.log((await wb.inspect({kind:'table',range:'Examples!A1:M6',tableMaxRows:6,tableMaxCols:13,maxChars:2400})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:20},summary:'Error scan'})).ndjson);
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(`${out}/Pay-Packages-Batch-Template.xlsx`);

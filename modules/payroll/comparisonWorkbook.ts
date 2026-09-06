import ExcelJS from 'exceljs';
import type {CompareTemplate,CompareInput} from './pilot';
const literal=(v:ExcelJS.CellValue):string=>{if(v==null)return '';if(typeof v==='string'||typeof v==='number')return String(v).trim();throw new Error('Use literal text and amounts; formulas, dates and linked cells are not accepted.');};
export function buildComparisonWorkbook(t:CompareTemplate){
 const b=new ExcelJS.Workbook();b.creator='TNG HRIS';
 const read=b.addWorksheet('Read first');
 [ ['TNG payroll comparison — internal review only'],['Run ID',t.runId],['Source fingerprint',t.sourceHash],['Period',`${t.from} to ${t.to}`],
 ['Legacy register reference',''],['Employee and component coverage reference',''],
 ['Instructions','Fill every Legacy PHP amount, including zero. For every difference enter its explanation and approved policy/source reference. Do not change source columns.'],
 ['Coverage','Paste the complete employee ID list from the legacy payroll into Legacy roster. Reconcile extra/omitted employees and components against the legacy source, mapping or aggregating amounts to the detailed comparison rows.'],
 ['Money','Literal PHP decimal amounts only. No formulas or thousands separators. Empty amounts are not zero.'],
 ['Acceptance','Uploading previews the workbook. Saving records a revision; HR and Finance independently accept the completed comparison after six shadow approval steps.'],
 ['Privacy','Contains salary data. Keep the workbook in your approved restricted payroll location.'] ].forEach(r=>read.addRow(r));
 const rows=b.addWorksheet('Comparison');rows.addRow(['Employee ID','Employee','Row key','Component','System PHP','Legacy PHP','Difference explanation','Approved policy / source']);
 t.rows.forEach(r=>rows.addRow([r.employeeId,r.employeeName,r.key,r.label,r.amount,'','','']));
 const roster=b.addWorksheet('Legacy roster');roster.addRow(['Employee ID from legacy payroll']);
 for(const s of b.worksheets){s.getRow(1).font={bold:true};s.views=[{state:'frozen',ySplit:1}];s.columns.forEach(c=>{c.width=32;});s.eachRow(r=>{r.alignment={vertical:'top',wrapText:true};});}
 read.getColumn(2).width=100;rows.getColumn(7).width=50;rows.getColumn(8).width=50;return b;
}
export async function parseComparisonWorkbook(data:ArrayBuffer,t:CompareTemplate):Promise<CompareInput>{
 if(data.byteLength>10*1024*1024)throw new Error('Workbook exceeds 10 MB. Remove unrelated sheets or embedded content.');
 const b=new ExcelJS.Workbook();await b.xlsx.load(data);const read=b.getWorksheet('Read first'),rows=b.getWorksheet('Comparison'),roster=b.getWorksheet('Legacy roster');
 if(!read||!rows||!roster)throw new Error('Use the downloaded comparison template.');
 if(literal(read.getCell('B2').value)!==t.runId||literal(read.getCell('B3').value)!==t.sourceHash)throw new Error('This workbook belongs to a different payroll version.');
 if(rows.rowCount>50001||roster.rowCount>10001)throw new Error('Workbook has too many rows.');
 const out:CompareInput={sourceRef:literal(read.getCell('B5').value),coverageRef:literal(read.getCell('B6').value),legacyEmployees:[],rows:[]};
 roster.eachRow((r,i)=>{if(i>1&&literal(r.getCell(1).value))out.legacyEmployees.push(literal(r.getCell(1).value));});
 const expected=new Map(t.rows.map(r=>[`${r.employeeId}/${r.key}`,r]));const seen=new Set<string>();
 rows.eachRow((r,i)=>{if(i===1)return;const values=Array.from({length:8},(_,n)=>literal(r.getCell(n+1).value));if(values.every(v=>!v))return;
 const [employeeId,,key,,amount,legacyAmount,explanation,policyRef]=values;const id=`${employeeId}/${key}`,source=expected.get(id);
 if(!source||seen.has(id)||amount!==source.amount)throw new Error(`Source row ${i} changed or is duplicated. Download a fresh template.`);
 if(!/^-?\d{1,12}(\.\d{1,2})?$/.test(legacyAmount))throw new Error(`Enter a literal PHP amount, including zero, in row ${i}.`);
 seen.add(id);out.rows.push({employeeId,key,legacyAmount,explanation,policyRef});});
 if(seen.size!==expected.size)throw new Error('Some comparison rows are missing.');
 const employees=[...new Set(t.rows.map(r=>r.employeeId))].sort();if(JSON.stringify([...out.legacyEmployees].sort())!==JSON.stringify(employees))throw new Error('Legacy roster has additional, missing or duplicate employees. Reconcile it before saving.');
 if(out.sourceRef.length<3||out.coverageRef.length<3)throw new Error('Fill both evidence references on Read first.');return out;
}
export async function downloadComparisonWorkbook(t:CompareTemplate){
 const bytes=await buildComparisonWorkbook(t).xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=`PAYROLL-COMPARISON-${t.from}-${t.to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

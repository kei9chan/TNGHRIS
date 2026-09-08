import React,{useEffect,useRef,useState} from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import {fetchPayPackages,savePayPackage} from './payPackages';
import {componentHeaders,packageHeaders,simpleHeaders,simpleImportRows,assertArrangementLive,arrangements,NET_ARRANGEMENTS_LIVE,prepareImport,ImportRow} from './payPackageImport';

type Preview={source:ImportRow;employeeId:string;name:string;error:string;status:string};
const PayPackageBatchUpload:React.FC<{directory:{id:string;name:string;employeeCode:string}[];onSaved:()=>void}>=({directory,onSaved})=>{
 const saving=useRef(false);const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const [rows,setRows]=useState<Preview[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function upload(file:File){
  setBusy(true);setRows([]);setError('');
  try{
   if(!file.name.toLowerCase().endsWith('.xlsx')||file.size>5*1024*1024)throw new Error('Choose an .xlsx file under 5 MB.');
   const ExcelJS=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());
   function read(name:string,headers:string[]){
    const sheet=workbook.getWorksheet(name);if(!sheet)throw new Error(`Missing ${name} sheet.`);
    if(sheet.rowCount>1001)throw new Error(`${name}: maximum 1,000 rows.`);
    const cell=(r:number,c:number)=>{const v=sheet!.getCell(r,c).value;if(v==null)return '';if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==='object')throw new Error(`${name} row ${r}: use plain values, not formulas or links.`);return String(v).trim();};
    headers.forEach((h,i)=>{if(cell(1,i+1)!==h)throw new Error(`${name}: keep the template column headers unchanged.`);});
    const result:{row:number;values:Record<string,string>}[]=[];
    for(let r=2;r<=sheet.rowCount;r++){const values=Object.fromEntries(headers.map((h,i)=>[h,cell(r,i+1)]));if(Object.values(values).some(Boolean))result.push({row:r,values});}
    return result;
   }
   let imports:ImportRow[];
   if(workbook.getWorksheet('Pay Input')){
    imports=simpleImportRows(read('Pay Input',simpleHeaders));
   }else{
   const exampleKey=(key:string)=>key.trim().toUpperCase().startsWith('EXAMPLE-');
   const examplePackage=(p:{row:number;values:Record<string,string>})=>exampleKey(p.values['Package key'])&&p.values['Employee code'].trim().toUpperCase().startsWith('TNG-EXAMPLE-');
   const allPackages=read('Packages',packageHeaders);const sampleKeys=new Set(allPackages.filter(examplePackage).map(p=>p.values['Package key']));
   const packages=allPackages.filter(p=>!examplePackage(p));
   if(packages.some(p=>sampleKeys.has(p.values['Package key'])))throw new Error('A real row reuses a sample package key. Give it a unique key and update its components, or use the new single-row template.');
   const components=read('Components',componentHeaders).filter(c=>!sampleKeys.has(c.values['Package key']));
   imports=packages.map(p=>({...p,components:components.filter(c=>c.values['Package key']===p.values['Package key']).map(c=>c.values)}));
   for(const c of components)if(!packages.some(p=>p.values['Package key']===c.values['Package key']))throw new Error(`Components row ${c.row}: unknown package key.`);
   }
   const packages=imports;
   if(!packages.length)throw new Error('No upload rows found. Example rows are ignored; add at least one real package row.');
   if(packages.length>100)throw new Error('Include between 1 and 100 packages per upload.');
   const keys=new Set<string>();const engagements=new Set<string>();
   for(const p of packages){const key=p.values['Package key'];if(!key||keys.has(key))throw new Error(`Row ${p.row}: package keys must be unique and nonempty.`);keys.add(key);
    const v=p.values;const identity=[v['Employee code'],v['Pay stream']==='employee_payroll'?'employee':v['Engagement reference'],v['Effective from']].join('|');if(engagements.has(identity))throw new Error(`Row ${p.row}: duplicate employee, engagement and date.`);engagements.add(identity);}
   const preview:Preview[]=[];
   for(const p of packages){
    const source=p;
    const matches=directory.filter(e=>e.employeeCode&&e.employeeCode===p.values['Employee code']);const employee=matches.length===1?matches[0]:null;
    let issue='';try{if(!employee)throw new Error('Employee code is missing, ambiguous or outside your access.');assertArrangementLive((arrangements as Record<string,string>)[source.values['Salary arrangement']||'Gross salary']);prepareImport(source,await fetchPayPackages(employee.id));}catch(e){issue=e instanceof Error?e.message:'Validation failed.';}
    preview.push({source,employeeId:employee?.id||'',name:employee?.name||p.values['Employee code'],error:issue,status:'Ready'});
   }
   setRows(preview);
  }catch(e){setError(e instanceof Error?e.message:'Could not read workbook.');}finally{setBusy(false);}
 }
 async function save(){
  if(saving.current)return;saving.current=true;
  setBusy(true);setError('');const next=[...rows];
  try{for(let i=0;i<next.length;i++){
   if(!active.current)break;
   if(next[i].status==='Saved')continue;
   try{assertArrangementLive((arrangements as Record<string,string>)[next[i].source.values['Salary arrangement']||'Gross salary']);const p=prepareImport(next[i].source,await fetchPayPackages(next[i].employeeId));if(!active.current)break;await savePayPackage(p.employeeId,p.scopeId,p.payload,p.hash);next[i]={...next[i],status:'Saved'};setRows([...next]);}
   catch(e){next[i]={...next[i],status:'Check before retry',error:e instanceof Error?e.message:'Save failed.'};setRows([...next]);setError('Stopped at the first failed row. Earlier saved drafts remain saved. Refresh and check the employee’s packages before uploading remaining rows.');break;}
  }}finally{saving.current=false;if(active.current){setBusy(false);onSaved();}}
 }
 return <Card title="Batch upload pay packages"><p className="text-sm mb-3"><strong>One row per pay arrangement.</strong> Fill only the <strong>Pay Input</strong> tab: employee, approved pay, gross/net arrangement and allowances all stay on the same row. No package keys or separate Components tab. Examples are on a separate, non-uploaded tab. For an employee who also consults, use two rows with the same employee code: Employee salary and Consultant fee.</p><p className="text-sm mb-3">Choose dropdown suggestions or type your actual document references and custom allowance names. Dates and amounts must be valid; business units and employee codes must match HRIS. Keep approved basic pay separate from the agreed net target. Net means the company covers specified deductions—not that the employee is tax exempt. Exemption requests require evidence and review; importing never switches tax off.</p>
  {!NET_ARRANGEMENTS_LIVE&&<p role="status" className="mb-3 rounded bg-amber-100 p-3 text-sm text-amber-950">Single-row gross-salary uploads are live. Net/custom rows can be prepared in the template but cannot be saved until the production tax-engine update is approved. Do not relabel a net arrangement as Gross.</p>}<div className="flex flex-wrap items-center gap-3"><a className="text-indigo-600 underline dark:text-indigo-300" href="/templates/Pay-Packages-Batch-Template.xlsx" download>Download Excel template</a><label className="text-sm">Upload completed template <input className="block mt-1" type="file" accept=".xlsx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label></div>
  <details className="mt-3 text-sm"><summary>Employee codes you can access</summary><div className="max-h-48 overflow-auto">{directory.map(e=><p key={e.id}>{e.employeeCode||'No employee code — update HRIS first'} · {e.name}</p>)}</div></details>
  <p className="mt-3 text-sm">Amounts must match the selected HRIS or approved PAN source. Existing packages on the same date must be reviewed individually. Treatments remain unreviewed; uploading does not approve packages or release payments.</p>
  {busy&&<p role="status" className="mt-3">Processing…</p>}{error&&<p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
  {rows.length>0&&<><div className="overflow-auto mt-4"><table className="w-full text-sm text-left"><thead><tr>{['Row','Employee','Scope','Stream','Effective','Amount','Result'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t" key={r.source.row}><td className="p-2">{r.source.row}</td><td className="p-2">{r.name}</td><td className="p-2">{r.source.values[packageHeaders[2]]}</td><td className="p-2">{r.source.values['Pay stream']}</td><td className="p-2">{r.source.values['Effective from']}</td><td className="p-2">{r.source.values['Basic pay / fee amount']} / {r.source.values['Amount unit']}</td><td className="p-2">{r.error||r.status}</td></tr>)}</tbody></table></div><Button className="mt-3" disabled={busy||rows.some(r=>!!r.error)||rows.every(r=>r.status==='Saved')} onClick={()=>void save()}>Save {rows.filter(r=>r.status!=='Saved').length} drafts</Button></>}
 </Card>;
}

export default PayPackageBatchUpload;

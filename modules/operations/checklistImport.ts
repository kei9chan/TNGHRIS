import type { OpsContent, OpsItemDraft, OpsResponse } from './types';
export const importColumns=['Checklist','Task','Instructions','Required','Category','Location','Description','SOP URL','Response Type','Allow NA','Photo Required','Reading Unit','Expected Min','Expected Max'];
const categories=['Opening','Closing','Cleaning','Maintenance','Inspection','Inventory','Handover','Other'];
export function parseCsv(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else throw new Error('Unexpected quote in CSV.');}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw new Error('Unclosed quoted field in CSV.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
const value=(v:unknown):string=>{
  if(v==null)return '';if(typeof v==='object'){const x=v as {text?:string;richText?:{text:string}[];formula?:string};if(x.formula)throw new Error('Replace spreadsheet formulas with values before importing.');return x.text||x.richText?.map(t=>t.text).join('')||'';}return String(v).trim();
};
function task(title:string,instructions='',required=true,sop_url=''):OpsItemDraft{return {snapshot:{title,instructions,priority:'Normal',evidence:'none',sop_url},required,response_type:'none'};}
function validate(checklists:OpsContent[]):OpsContent[]{
  if(!checklists.length||checklists.length>50)throw new Error('Choose a file containing 1–50 checklists.');
  for(const c of checklists){if(c.title.length<3||c.title.length>180)throw new Error(`Checklist title must be 3–180 characters: ${c.title}`);if(!c.items?.length||c.items.length>200)throw new Error(`Checklist ${c.title} needs 1–200 tasks.`);for(const i of c.items){if(!i.snapshot||i.snapshot.title.length<3||i.snapshot.title.length>180)throw new Error(`Task title must be 3–180 characters in ${c.title}.`);if(i.snapshot.sop_url&&!/^https?:\/\//.test(i.snapshot.sop_url))throw new Error(`Invalid SOP URL in ${c.title}.`);}}
  return checklists;
}
export function parseChecklistRows(sheets:{name:string;rows:unknown[][]}[]):OpsContent[]{
 const result:OpsContent[]=[];
 for(const sheet of sheets){const rows=sheet.rows.map(r=>r.map(value));const header=rows.findIndex(r=>r[0]?.toLowerCase()==='checklist'&&r[1]?.toLowerCase()==='task');
  if(header>=0){const columns=rows[header].map(x=>x.toLowerCase());const groups=new Map<string,OpsContent>();const get=(r:string[],name:string)=>r[columns.indexOf(name)]||'';
   for(const [index,r] of rows.entries()){if(index<=header||r.every(x=>!x))continue;const title=get(r,'checklist'),name=get(r,'task');if(!title||!name)throw new Error(`Sheet ${sheet.name}, row ${index+1}: Checklist and Task are required.`);
    const required=get(r,'required').toLowerCase();if(required&&!['yes','no','true','false','1','0'].includes(required))throw new Error(`Row ${index+1}: Required must be Yes or No.`);
    const category=get(r,'category')||'Other';if(!categories.includes(category))throw new Error(`Row ${index+1}: Invalid category.`);
    let c=groups.get(title);if(!c){c={title,category,location:get(r,'location'),description:get(r,'description'),priority:'Normal',items:[]};groups.set(title,c);}else if(c.category!==category||c.location!==get(r,'location')||c.description!==get(r,'description'))throw new Error(`Keep Category, Location and Description consistent for ${title}.`);
    const item=task(name,get(r,'instructions'),!['no','false','0'].includes(required),get(r,'sop url'));
    const response=get(r,'response type')||'none';if(!['none','yes_no','text','photo','numeric'].includes(response))throw new Error(`Row ${index+1}: Invalid response type.`);item.response_type=response as OpsResponse;
    const bool=(key:string)=>{const v=get(r,key).toLowerCase();if(v&&!['yes','no','true','false','1','0'].includes(v))throw new Error(`Row ${index+1}: ${key} must be Yes or No.`);return ['yes','true','1'].includes(v);};
    const number=(key:string)=>{const v=get(r,key);if(!v)return null;const n=Number(v);if(!Number.isFinite(n))throw new Error(`Row ${index+1}: ${key} must be numeric.`);return n;};
    item.snapshot={...item.snapshot!,allow_na:bool('allow na'),photo_required:bool('photo required'),unit:get(r,'reading unit'),min:number('expected min'),max:number('expected max')};if(item.snapshot.min!=null&&item.snapshot.max!=null&&item.snapshot.min>item.snapshot.max)throw new Error(`Row ${index+1}: minimum exceeds maximum.`);c.items!.push(item);
   }result.push(...groups.values());
  }else{
   // Original operational form: section name, YES/NO/REMARKS headings, then task rows.
   let c:OpsContent|undefined;let heading='';let recognized=false;
   for(const r of rows){if(!r.some(Boolean))continue;if(r[1]?.toUpperCase()==='YES'&&r[2]?.toUpperCase()==='NO'){
    if(!heading)throw new Error('Each YES / NO section needs a checklist title.');c={title:heading,category:'Inspection',priority:'Normal',description:'Inspect each item and record Yes or No. Describe issues in the remarks.',items:[]};result.push(c);recognized=true;continue;
   }
   if(r[0]&&r.slice(1).some(x=>['false','true'].includes(x.toLowerCase()))){if(!c)throw new Error('Task rows need a checklist section.');const item=task(r[0],r[3]||'');item.response_type='yes_no';c.items!.push(item);}
   else if(r[0]&&r.slice(1).every(x=>!x)){heading=r[0];c=undefined;}
   else throw new Error(`Unrecognized row in ${sheet.name}. Use Export sample for the supported format.`);
   }if(!recognized&&rows.some(r=>r.some(Boolean)))throw new Error(`Sheet ${sheet.name}: use the exported sample or a YES / NO checklist form.`);
  }
 }
 return validate(result);
}
export async function readChecklistFile(file:File):Promise<OpsContent[]>{
 if(file.size>5*1024*1024)throw new Error('Maximum import size is 5 MB.');
 if(/\.csv$/i.test(file.name))return parseChecklistRows([{name:file.name,rows:parseCsv(await file.text())}]);
 if(!/\.xlsx$/i.test(file.name))throw new Error('Choose an .xlsx or .csv file.');
 const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());
 let count=0;const sheets:{name:string;rows:unknown[][]}[]=[];
 workbook.eachSheet(sheet=>{const rows:unknown[][]=[];sheet.eachRow({includeEmpty:false},row=>{if(++count>10000)throw new Error('Too many rows. Maximum 10,000.');rows.push(Array.from({length:Math.min(sheet.columnCount,32)},(_,i)=>{const c=row.getCell(i+1);return c.isMerged&&c.master.address!==c.address?null:c.value;}));});sheets.push({name:sheet.name,rows});});return parseChecklistRows(sheets);
}
export function sampleChecklistCsv():string {
 const rows=[importColumns,['Bar Opening','Check refrigerator temperature','Inspect refrigerator and confirm it is operating.','Yes','Opening','Main bar','Opening readiness checklist','','numeric','No','Yes','°C','2','5'],['Bar Opening','Clean bar counter','Clean and sanitize the counter.','Yes','Opening','Main bar','Opening readiness checklist','','yes_no','No','No','','',''],['Bar Closing','Switch off unused equipment','Follow the closing SOP.','Yes','Closing','Main bar','Closing readiness checklist','','none','Yes','No','','','']];
 return '\uFEFF'+rows.map(r=>r.map(x=>'"'+x.replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
export function exportChecklistSample(){const url=URL.createObjectURL(new Blob([sampleChecklistCsv()],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='TNG-Checklist-Import-Sample.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

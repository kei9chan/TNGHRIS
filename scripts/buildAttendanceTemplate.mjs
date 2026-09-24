// Run from a temporary directory linked to the Codex primary runtime dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=process.argv[2],output=process.argv[3];
if(!root||!output)throw new Error('Pass repository root and output directory.');
const schema=JSON.parse(await fs.readFile(path.join(root,'modules/payroll/attendanceTemplate.json'),'utf8'));
const book=Workbook.create();
const instructions=book.worksheets.add('Instructions');
const data=book.worksheets.add('Data Entry');
const examples=book.worksheets.add('Examples — Do Not Upload');
const guide=book.worksheets.add('Field Guide');
const lastColumn=String.fromCharCode(64+schema.fields.length);
for(const sheet of [instructions,data,examples,guide]){sheet.showGridLines=false;sheet.getRange(`A1:${lastColumn}30`).format.font.name='Aptos';sheet.getRange(`A1:${lastColumn}30`).format.font.size=11;sheet.freezePanes.freezeRows(1);}
instructions.getRange('A1:B1').values=[['Template type and version',`${schema.type}:${schema.version}`]];
instructions.getRange('A2:B11').values=[
 ['Template',schema.title],['Fill this sheet only','Data Entry. Do not rename columns or sheets.'],
 ['One row means',schema.meaning],['1. Prepare','Choose the correct business unit and payroll period in HRIS.'],
 ['2. Fill Data Entry','Use actual HRIS Employee IDs. Fields marked * are required. Choose a Day status for every row. Workday requires actual punches.'],
 ['3. Upload and preview','Upload this workbook, review errors and duplicates, then confirm.'],
 ['Dates and time','Real Excel dates or ISO YYYY-MM-DD. Date/time: YYYY-MM-DD HH:mm. Asia/Manila. Include explicit next-day dates for overnight shifts.'],
 ['Examples','Examples — Do Not Upload contains fictional DEMO IDs. These are rejected by real imports. Never copy them as employee records.'],
 ['Values only','No formulas. Paste values. Payroll derives hours, lateness and authorized overtime; do not supply calculated amounts.'],
 ['No-punch days','Rest day must match the roster; holidays must match the official calendar; suspension must be authorized. Absent and missing punches remain pending review. Never invent clock times.']
];
instructions.getRange('A1:A11').format.columnWidth=29;
instructions.getRange('B1:B11').format.columnWidth=94;
instructions.getRange('A1:B11').format.wrapText=true;
instructions.getRange('A1:B11').format.rowHeight=50;
instructions.getRange('A1:B1').format.fill='#312E81';instructions.getRange('A1:B1').format.font.color='#FFFFFF';
for(const sheet of [data,examples]){
 sheet.getRangeByIndexes(0,0,1,schema.fields.length).values=[schema.fields.map(f=>f.label)];
 sheet.getRange(`A1:${lastColumn}1`).format.rowHeight=46;sheet.getRange(`A1:${lastColumn}1`).format.wrapText=true;
 for(const [i,f] of schema.fields.entries()){
  const col=sheet.getRangeByIndexes(0,i,101,1);col.format.columnWidth=f.key==='notes'?45:f.key==='dayStatus'?28:i===1?27:25;
  sheet.getRangeByIndexes(1,i,100,1).setNumberFormat(f.format);
  const header=sheet.getCell(0,i);header.format.fill=f.required?'#6D28D9':'#EDE9FE';header.format.font.color=f.required?'#FFFFFF':'#312E81';header.format.font.bold=true;
  if(f.choices)sheet.getRangeByIndexes(1,i,100,1).dataValidation={rule:{type:'list',values:f.choices}};
 }
 sheet.getRange(`A2:${lastColumn}101`).format.rowHeight=28;
 sheet.tabColor=sheet===data?'#7C3AED':'#D97706';
}
examples.getRangeByIndexes(1,0,schema.samples.length,schema.fields.length).values=schema.samples.map(row=>row.map((value,i)=>['workDate','clockIn','breakStart','breakEnd','clockOut'].includes(schema.fields[i].key)&&value?new Date(value.replace(' ','T')+(schema.fields[i].key==='workDate'?'T00:00:00Z':':00Z')):value));
guide.getRange('A1:C1').values=[['Field','Requirement','Accepted values and explanation']];
guide.getRangeByIndexes(1,0,schema.fields.length,3).values=schema.fields.map(f=>[f.label,f.required?'Required':f.key.includes('reference')||f.key==='notes'?'Optional':'Conditional: actual recorded punch',f.guide]);
guide.getRange('A1:C11').format.wrapText=true;guide.getRange('A1:C11').format.rowHeight=60;
guide.getRange('A1:A11').format.columnWidth=29;guide.getRange('B1:B11').format.columnWidth=34;guide.getRange('C1:C11').format.columnWidth=82;
guide.getRange('A1:C1').format.fill='#312E81';guide.getRange('A1:C1').format.font.color='#FFFFFF';
book.recalculate();
console.log((await book.inspect({kind:'table',range:`Data Entry!A1:${lastColumn}3`,tableMaxRows:3,tableMaxCols:schema.fields.length,maxChars:1500})).ndjson);
console.log((await book.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:10},maxChars:500})).ndjson);
await fs.mkdir(output,{recursive:true});
for(const [sheet,range] of [['Instructions','A1:B11'],['Data Entry',`A1:${lastColumn}6`],['Examples — Do Not Upload',`A1:${lastColumn}4`],['Field Guide','A1:C11']]){
 const render=await book.render({sheetName:sheet,range,scale:1.25});await fs.writeFile(path.join(output,sheet.replaceAll(' ','-')+'.png'),new Uint8Array(await render.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(book)).save(path.join(output,'attendance-v2.xlsx'));

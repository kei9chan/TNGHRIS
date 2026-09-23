import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const [schemaFile,output]=process.argv.slice(2);
const schemas=JSON.parse(await fs.readFile(schemaFile,'utf8'));
await fs.mkdir(output,{recursive:true});
for(const schema of Object.values(schemas)){
 const book=Workbook.create();const instructions=book.worksheets.add('Instructions'),data=book.worksheets.add('Data Entry'),examples=book.worksheets.add('Examples — Do Not Upload'),guide=book.worksheets.add('Field Guide');
 for(const s of [instructions,data,examples,guide]){s.showGridLines=false;s.freezePanes.freezeRows(1);s.getRangeByIndexes(0,0,Math.max(14,schema.fields.length+1),schema.fields.length).format.font.name='Aptos';}
 const steps=[['Template type and version',`${schema.type}:${schema.version}`],['Template',schema.title],['Fill this sheet only','Data Entry. The entry sheet is intentionally blank.'],['One row means',schema.meaning],['1. Prepare','Choose the business unit and payroll period in HRIS. Download a prefilled CSV if helpful.'],['2. Fill','Use actual HRIS IDs. Required fields are marked *. Keep IDs and references as text. Numeric amounts use pesos without a peso sign.'],['3. Preview and confirm','Upload, map non-template columns if needed, correct errors, then confirm or submit for approval.'],['Dates and time','Use real Excel dates or YYYY-MM-DD. Times: YYYY-MM-DD HH:mm, Asia/Manila. Overnight shifts require explicit next-day dates.'],['Examples','DEMO IDs are fictional and rejected in real uploads. Examples are never imported.'],['Values only','Paste values. Formulas and linked cells are rejected. Do not calculate payroll amounts in the spreadsheet.'],['Approval and record rules',schema.notice]];
 instructions.getRangeByIndexes(0,0,steps.length,2).values=steps;instructions.getRange('A1:A11').format.columnWidth=29;instructions.getRange('B1:B11').format.columnWidth=96;instructions.getRange('A1:B11').format.wrapText=true;instructions.getRange('A1:B11').format.rowHeight=56;
 for(const sheet of [data,examples]){
  sheet.getRangeByIndexes(0,0,1,schema.fields.length).values=[schema.fields.map(f=>f.label)];sheet.getRangeByIndexes(0,0,1,schema.fields.length).format.rowHeight=60;sheet.getRangeByIndexes(0,0,1,schema.fields.length).format.wrapText=true;
  for(const [i,f] of schema.fields.entries()){
   const range=sheet.getRangeByIndexes(1,i,100,1);sheet.getRangeByIndexes(0,i,101,1).format.columnWidth=['notes','document','description'].includes(f.key)?42:27;
   range.setNumberFormat(f.type==='number'?'0.00':f.type==='date'?'yyyy-mm-dd':f.type==='datetime'?'yyyy-mm-dd hh:mm':'@');
   if(f.choices)range.dataValidation={rule:{type:'list',values:f.choices}};
   sheet.getCell(0,i).format.fill=f.required?'#6D28D9':'#EDE9FE';sheet.getCell(0,i).format.font.color=f.required?'#FFFFFF':'#312E81';sheet.getCell(0,i).format.font.bold=true;
  }sheet.getRangeByIndexes(1,0,100,schema.fields.length).format.rowHeight=30;
 }
 const sample=schema.fields.map(f=>{const value=schema.sample[f.key];if(!value)return '';if(f.type==='number')return Number(value);if(f.type==='date')return new Date(value+'T00:00:00Z');if(f.type==='datetime')return new Date(value.replace(' ','T')+':00Z');return value;});examples.getRangeByIndexes(1,0,1,sample.length).values=[sample];
 if(schema.type==='schedules'){examples.getRangeByIndexes(2,0,1,sample.length).values=[schema.fields.map(f=>f.key==='dayType'?'Rest day':f.key==='workDate'?new Date('2026-08-27T00:00:00Z'):['employeeId','employeeName','businessUnit'].includes(f.key)?schema.sample[f.key]||'':'')];}
 guide.getRange('A1:C1').values=[['Field','Requirement','Accepted format and conditions']];guide.getRangeByIndexes(1,0,schema.fields.length,3).values=schema.fields.map(f=>[f.label,f.required?'Required':'Optional or conditional',`${f.help||'Enter the source value.'}${f.choices?' Allowed: '+f.choices.join(', ')+'.':''}`]);guide.getRangeByIndexes(0,0,schema.fields.length+1,3).format.wrapText=true;guide.getRangeByIndexes(0,0,schema.fields.length+1,3).format.rowHeight=58;guide.getRange('A1:A30').format.columnWidth=35;guide.getRange('B1:B30').format.columnWidth=26;guide.getRange('C1:C30').format.columnWidth=84;
 for(const s of [instructions,guide]){s.getRangeByIndexes(0,0,1,s===guide?3:2).format.fill='#312E81';s.getRangeByIndexes(0,0,1,s===guide?3:2).format.font.color='#FFFFFF';}
 book.recalculate();console.log(schema.type,(await book.inspect({kind:'table',range:'Data Entry!A1:C2',tableMaxRows:2,tableMaxCols:3,maxChars:400})).ndjson);
 const dir=path.join(output,'previews',schema.type);await fs.mkdir(dir,{recursive:true});
 for(const [sheet,range] of [['Instructions','A1:B11'],['Data Entry',`A1:${String.fromCharCode(64+schema.fields.length)}4`],['Examples — Do Not Upload',`A1:${String.fromCharCode(64+schema.fields.length)}4`],['Field Guide',`A1:C${schema.fields.length+1}`]]){const image=await book.render({sheetName:sheet,range,scale:1});await fs.writeFile(path.join(dir,sheet+'.png'),new Uint8Array(await image.arrayBuffer()));}
 await (await SpreadsheetFile.exportXlsx(book)).save(path.join(output,`${schema.type}-v1.xlsx`));
}

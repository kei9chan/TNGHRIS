import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const root=new URL('../',import.meta.url);
const files=['model','export'];
try{
 for(const name of files){let src=fs.readFileSync(new URL(`modules/case-register/${name}.ts`,root),'utf8');src=src.replace("'./model'","'./.case-register-model.mjs'");fs.writeFileSync(new URL(`.case-register-${name}.mjs`,import.meta.url),ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
 const {createReport}=await import('./.case-register-export.mjs');
 const {safeLink,csvCell,exportFilters,columns}=await import('./.case-register-model.mjs');
 assert.equal(safeLink('javascript:alert(1)','https://fixture.invalid'),null);
 assert.equal(safeLink('https://user:pass@example.invalid','https://fixture.invalid'),null);
 assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('say "hello"'),'"say ""hello"""');
 assert.throws(()=>exportFilters({buId:'a'},'bu','b','','',''),/filtered Business Unit/);
 assert.deepEqual(exportFilters({keyword:'keep',from:'2026-01-15'},'filtered','','','2026-01-01','2026-02-01'),{keyword:'keep',from:'2026-01-15',to:'2026-02-01'});
 assert.deepEqual(exportFilters({buId:'a'},'all','','','',''),{});
 const rows=[{id:'fixture',incidentId:'fixture',employeeId:'fixture',reference:'TEST-001',employee:'Fixture Employee',businessUnit:'BU A',offense:'Conduct',summary:'=HYPERLINK("https://invalid")',status:'Open',stage:'IR review',pendingDays:12,nteDocument:'/feedback/cases?caseId=fixture',resolutionDays:null}];
 const keys=['reference','employee','summary','pendingDays','nteDocument'];const meta={auditId:'fixture-audit',generatedAt:'2026-09-14T12:00:00Z',filters:{buId:'a'}};
 const csv=await (await createReport(rows,keys,'csv','detailed',meta,'https://fixture.invalid')).text();assert.match(csv,/CONFIDENTIAL/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/fixture-audit/);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await (await createReport(rows,keys,'xlsx','detailed',meta,'https://fixture.invalid')).arrayBuffer());
 const sheet=workbook.worksheets[0];assert.equal(sheet.getRow(5).getCell(4).value,12);assert.equal(typeof sheet.getRow(5).getCell(3).value,'string');assert.equal(sheet.getRow(5).getCell(5).value.hyperlink,'https://fixture.invalid/feedback/cases?caseId=fixture');assert.equal(sheet.columnCount,5);
 const summary=new ExcelJS.Workbook();await summary.xlsx.load(await (await createReport(rows,keys,'xlsx','summary',meta,'https://fixture.invalid')).arrayBuffer());assert.equal(summary.worksheets[0].getRow(5).getCell(3).value,1);
 const pdf=await createReport(rows,columns.map(c=>c[0]),'pdf','detailed',meta,'https://fixture.invalid');assert.equal((await pdf.text()).slice(0,4),'%PDF');assert.ok(pdf.size>1000);
 console.log('PASS: editable XLSX cells, native hyperlinks, CSV formula protection, selected columns, summary counts, PDF generation, export filter intersection.');
}finally{for(const name of files)fs.rmSync(new URL(`.case-register-${name}.mjs`,import.meta.url),{force:true});}

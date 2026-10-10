import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}});
try{
 const {parseCsv,parseChecklistRows,sampleChecklistCsv,readChecklistFile}=await server.ssrLoadModule('/modules/operations/checklistImport.ts');
 const sample=sampleChecklistCsv();const templates=parseChecklistRows([{name:'sample',rows:parseCsv(sample)}]);assert.equal(templates.length,2);assert.equal(templates[0].items.length,2);assert.equal(templates[0].items[0].response_type,'numeric');assert.equal(templates[0].items[0].snapshot.photo_required,true);assert.equal(templates[0].items[0].snapshot.min,2);assert.equal(templates[0].items[1].response_type,'yes_no');
 assert.deepEqual(parseCsv('"A","quoted ""name""","two\nlines"'),[['A','quoted "name"','two\nlines']]);
 assert.throws(()=>parseCsv('"Unclosed'),/Unclosed/);
 assert.throws(()=>parseChecklistRows([{name:'bad',rows:[['Checklist','Task','Required'],['One','Check','Maybe']]}]),/Yes or No/);
 assert.throws(()=>parseChecklistRows([{name:'bad',rows:[['Checklist','Task','Category'],['One','Check','Opening'],['One','Clean','Closing']]}]),/consistent/);
 assert.throws(()=>parseChecklistRows([{name:'bad',rows:[['Checklist','Task'],['One','']]}]),/required/);
 const form=parseChecklistRows([{name:'form',rows:[['CHECKLIST'],['DINING'],['','YES','NO','REMARKS'],['Floor clean',false,false,'Inspect'],['BAR'],['','YES','NO','REMARKS'],['Chiller working',false,false]]}]);assert.equal(form.length,2);assert.equal(form[0].items[0].response_type,'yes_no');assert.equal(form[0].items[0].snapshot.instructions,'Inspect');
 if(process.env.TNG_FUNROOF_CHECKLIST){const file=new File([fs.readFileSync(process.env.TNG_FUNROOF_CHECKLIST)],'Checklist.xlsx');const actual=await readChecklistFile(file);assert.equal(actual.length,9);assert.equal(actual.reduce((n,c)=>n+c.items.length,0),96);fs.writeFileSync('/tmp/tng-funroof-checklists.json',JSON.stringify(actual));console.log('Uploaded Fun Roof workbook parsed: 9 checklists, 96 tasks.');}
 console.log('Checklist parser passed: exported sample roundtrip, quoted/multiline CSV, rejected invalid rows, original YES/NO form.');
}finally{await server.close();}

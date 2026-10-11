import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const output=path.resolve('tests/tmp-creation-ui.mjs');
try {
 const result=await build({stdin:{contents:`
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import TemplateEditor from '../modules/operations/TemplateEditor';
import {RuleEditor} from '../modules/operations/AutomationWorkspace';
import ChecklistItems from '../modules/operations/ChecklistItems';
import LibraryView from '../modules/operations/LibraryView';
import {ScheduleFields} from '../modules/operations/CreationUI';
import {defaults} from '../modules/operations/schedule';
import {latestVersion,publishedChoices,scheduleSummary,scheduleError} from '../modules/operations/creation';
const v1={id:'v1',version:1,content:{title:'Old task title',instructions:'Old instructions'},items:[]};
const v2={id:'v2',version:2,content:{title:'Kitchen Closing',instructions:'Current instructions',duration:15},items:[]};
const task={id:'task',created_by:'manager',kind:'task',business_unit_id:'unit',status:'Published',draft:{title:'Unpublished draft title'},revision:2,latest_version:2,versions:[v1,v2]};
const archived={...task,id:'archived',status:'Archived',versions:[{...v2,id:'archivev'}]};
const w={actor:'manager',masterAdmin:false,units:[{id:'unit',name:'Fun Roof',manage:true,edit:true,assign:true}],departments:[{id:'kitchen',name:'Kitchen'}],people:[{id:'manager',name:'Unit Manager',position:'Manager',roles:['Business Unit Manager'],bum:true,can_assign:true,department_id:'kitchen'}],assets:[],templates:[task,archived],assignments:[],permissions:[]};
export const latest=latestVersion(task).id;
export const options=publishedChoices(w.templates,'unit').map(x=>x.version.id);
export const taskForm=render(<TemplateEditor workspace={w} unit="unit" kind="task" onClose={()=>{}} onSaved={async()=>{}}/>);
export const checklist=render(<ChecklistItems workspace={w} unit="unit" items={[]} onChange={()=>{}}/>);
export const rule=render(<RuleEditor rule={null} workspace={w} unit="unit" onClose={()=>{}} onSaved={async()=>{}}/>);
export const library=render(<LibraryView workspace={w} unit="unit" kind="task" templates={[task]} query="" onQuery={()=>{}} status="All" onStatus={()=>{}} canEdit canAssign busy={false} onCreate={()=>{}} onEdit={()=>{}} onAssign={()=>{}} onHistory={()=>{}} onDuplicate={()=>{}} onArchive={()=>{}} onImport={()=>{}} onExport={()=>{}}/>);
export const schedule=render(<ScheduleFields config={defaults()} onChange={()=>{}} enabled onEnabled={()=>{}}/>);
export const timing=[scheduleError({...defaults(),due_time:'23:00'}),scheduleError({...defaults(),frequency:'weekly',weekdays:[]}),scheduleError({...defaults(),start_time:'22:00',end_time:'02:00',due_time:'01:00',end_day_offset:1,due_day_offset:1}),scheduleError({...defaults(),anchor:'shift_start'},true,false)];
export const summary=scheduleSummary({...defaults(),frequency:'monthly',interval:3,month_day:15});
`,resolveDir:path.resolve('tests'),sourcefile:'creation-unit.tsx',loader:'tsx'},bundle:true,platform:'node',format:'esm',write:false,external:['react','react-dom/server'],plugins:[{name:'component-dependencies',setup(b){b.onResolve({filter:/components\/ui\/Modal$/},()=>({path:'modal',namespace:'test'}));b.onResolve({filter:/\.\/service$/},args=>args.importer.includes('operations')?({path:'service',namespace:'test'}):undefined);b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='modal'?"import React from 'react';export default function Modal(p){return React.createElement('section',{'aria-label':p.title},p.children,p.footer)}":"export const operationsRpc=async()=>({rules:[]});export const getOperationsWorkspace=async()=>({templates:[]});",loader:'js'}));}}]});
 fs.writeFileSync(output,result.outputFiles[0].text);const ui=await import(pathToFileURL(output));
 assert.equal(ui.latest,'v2');assert.deepEqual(ui.options,['v2']);
 assert.match(ui.taskForm,/Details/);assert.match(ui.taskForm,/People &amp; review/);assert.match(ui.taskForm,/Completion proof/);assert.match(ui.taskForm,/Optional details/);assert.doesNotMatch(ui.taskForm,/Suggested frequency|Saving a draft preserves|SOP \/ manual URL<\/span>.*Estimated/s);
 assert.match(ui.checklist,/<option value="v2">Kitchen Closing<\/option>/);assert.doesNotMatch(ui.checklist,/<option value="v1">/);
 assert.match(ui.rule,/<option value="v2">Kitchen Closing · task<\/option>/);assert.doesNotMatch(ui.rule,/published v1|Eligible employee pool|Non-operating dates/);
 assert.match(ui.library,/Kitchen Closing/);assert.doesNotMatch(ui.library,/Unpublished draft title|ID: task/);assert.match(ui.library,/Use latest/);
 for(const label of ['One-time','Daily','Weekly','Monthly','Selected dates','As needed','Custom'])assert.ok(ui.schedule.includes(label),label+' control present');
 assert.ok(ui.timing[0]);assert.ok(ui.timing[1]);assert.equal(ui.timing[2],'');assert.equal(ui.timing[3],'');assert.match(ui.summary,/Every 3 months/);
 if(process.env.TNG_CREATION_RENDER_DIR){fs.mkdirSync(process.env.TNG_CREATION_RENDER_DIR,{recursive:true});for(const [name,markup] of [['library',ui.library],['details',ui.taskForm],['schedule',ui.schedule],['maintenance',ui.rule]])fs.writeFileSync(path.join(process.env.TNG_CREATION_RENDER_DIR,name+'.html'),'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="file:///tmp/tng-ops-tailwind.js"></script></head><body class="bg-slate-100 p-6 text-slate-800"><main class="mx-auto max-w-4xl rounded-2xl bg-white p-6">'+markup+'</main></body></html>');}
 console.log('Creation UI: real components render, newest-only selection, current library titles, three steps, inline schedule presets and overnight validation passed.');
}finally{fs.rmSync(output,{force:true});}

import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const compiled=await build({stdin:{contents:`import React from 'react';import {renderToString} from 'react-dom/server';import EquipmentGroups,{equipmentPreset} from './modules/operations/EquipmentGroups';
export function check(){const members=[{id:'one',name:'Speaker 1'},{id:'two',name:'Speaker 2'}];const workspace={actor:'manager',people:[],units:[],templates:[]};const group={id:'group',name:'Fun Roof Speaker System',asset_tag:'GROUP-test',type:'Other',business_unit_id:'unit',unit_name:'Fun Roof',group:{id:'group',business_unit_id:'unit',category:'Speakers / Audio',location:'DJ area',revision:1,members}};
return {html:renderToString(<EquipmentGroups assets={[group]} workspace={workspace} unit="unit" canEdit canResolve onSaved={async()=>{}} onHistory={()=>{}} onCustom={()=>{}}/>),daily:equipmentPreset('Speakers / Audio','daily',members),monthly:equipmentPreset('Air Conditioning','monthly',members),quarterly:equipmentPreset('Speakers / Audio','quarterly',members)};}`,
resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolate-render',setup(b){b.onLoad({filter:/modules\/operations\/service\.ts$/},()=>({contents:'export async function operationsRpc(){return []};export async function getOperationsWorkspace(){return {}}',loader:'js'}));b.onLoad({filter:/AutomationWorkspace\.tsx$/},()=>({contents:'export function RuleEditor(){return null};export function defaults(){return {}}',loader:'js'}));b.onLoad({filter:/components\/ui\/Modal\.tsx$/},()=>({contents:'export default function Modal(){return null}',loader:'js'}));}}]});
const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);
const result=module.exports.check();
for(const text of ['Fun Roof Speaker System','Speaker 1','Speaker 2','Add recurring check','Use existing checklist','Equipment issues / repairs'])assert.ok(result.html.includes(text),text);
assert.equal(result.daily.length,5);assert.equal(result.monthly.length,2);assert.ok(result.monthly[0].startsWith('Speaker 1:'));assert.equal(result.quarterly.length,4);
console.log('PASS: grouped asset UI renders, recurrence actions exist, daily/monthly/quarterly starters stay bounded and monthly checks cover each individual unit.');

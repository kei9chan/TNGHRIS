// Actual React row component and handlers; mocked RPCs, no production calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const code=ts.transpileModule(fs.readFileSync('components/overtime/OtRequestReviewList.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const minutesLabel=n=>n==null?'Not confirmed':`${Math.floor(n/60)}h${n%60?` ${n%60}m`:''}`;
let state=[],refs=[],index=0,refIndex=0,calls=[],messages=[];
const service={minutesLabel,workDateLabel:d=>d,sendPayrollOt:async(rows,operation,note)=>{calls.push({action:'send',ids:rows.map(r=>r.id),operation,note});return rows;},decideOtWeek:async(ids,minutes,version,operation,action,note)=>{calls.push({ids,minutes,version,operation,action,note});return [{result:{status:'PendingBOD'}}];}};
const exports={};
vm.runInNewContext(code,{exports,crypto:globalThis.crypto,require:name=>name==='react'?{...React,useState:initial=>{const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:initial=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});}}:name.endsWith('manualOtService')?service:{supabase:{}}});
const row={id:'one',updated_at:'2026-09-30T00:00:00Z',date:'2026-09-08',start_time:'18:30',end_time:'20:30',reason:'Closing coverage',requestedMinutes:120,reviewedMinutes:null,finalMinutes:null,status:'Approved',canSend:true,canDecide:false,blocked:null,managerName:'Sample Manager',history_log:[]};
const week={employeeId:'sample',employee:{name:'Sample Employee',position:'Cashier',businessUnit:'Sample BU'},version:'version',requests:[row],summary:{weekStart:'2026-09-07',weekEnd:'2026-09-13',regularMinutes:2880,approvedMinutes:null,reviewedMinutes:0,projectedMinutes:null,thresholdMinutes:3000,quantitiesMissing:true}};
let props;
function reset(overrides={}){state=[];refs=[];calls=[];messages=[];props={week,rows:[row],readOnly:false,onChanged:m=>messages.push(m),...overrides};}
function render(){index=0;refIndex=0;return exports.BulkRows({...props,groups:props.groups||[{week:props.week,rows:props.rows}]});}
function flatten(e){if(!e||typeof e!=='object')return[];return [e,...React.Children.toArray(e.props?.children).flatMap(flatten)];}
function text(e){return React.Children.toArray(e?.props?.children).map(x=>typeof x==='object'?text(x):String(x)).join('');}
function find(type,label){return flatten(render()).find(e=>e.type===type&&text(e).includes(label));}
reset();let html=renderToStaticMarkup(render());
assert.match(html,/Requested OT/);assert.match(html,/2h/);assert.match(html,/Needs manager hours/);assert.match(html,/Closing coverage/);assert.doesNotMatch(html,/<select/);assert.doesNotMatch(html,/Employee weeks|Verify entered hours/);
find('button','Select all 1 to send').props.onClick();assert.equal(find('button','to manager for approval').props.disabled,false);
await find('button','to manager for approval').props.onClick();assert.equal(calls.length,1);assert.equal(calls[0].action,'send');assert.deepEqual(Array.from(calls[0].ids),['one']);assert.equal(calls[0].note,'');
const pending={...row,status:'Submitted',canSend:false,canDecide:true,handoff:{senderName:'Payroll Sender',note:'Please review',state:'Manager review'}};
reset({week:{...week,summary:{...week.summary,quantitiesMissing:false}},rows:[pending]});
find('button','Select all 1 eligible').props.onClick();
const input=flatten(render()).find(e=>e.type==='input'&&e.props['aria-label']?.startsWith('Approved OT hours'));input.props.onChange({target:{value:'1.5'}});
await find('button','Approve 1 selected').props.onClick();assert.equal(calls.length,1);assert.equal(calls[0].minutes.one,90);assert.equal(calls[0].note,'');assert.match(messages[0],/BOD/);
reset({week:{...week,summary:{...week.summary,quantitiesMissing:false}},rows:[pending]});find('button','Select all 1 eligible').props.onClick();await find('button','Return for details').props.onClick();assert.equal(calls.length,0);assert.match(renderToStaticMarkup(render()),/Enter the reason/);
flatten(render()).find(e=>e.type==='textarea').props.onChange({target:{value:'Which task required the extra hour?'}});await find('button','Return for details').props.onClick();assert.equal(calls[0].action,'return');assert.match(calls[0].note,/Which task/);
const blocked={...pending,id:'duplicate',date:'2026-09-09',blocked:'Overlapping request'};
reset({rows:[pending,blocked]});find('button','Select all 1 eligible').props.onClick();assert.equal(state[0].length,1);assert.equal(state[0][0],'one');
reset({readOnly:true});assert.doesNotMatch(renderToStaticMarkup(render()),/Send .*to manager for approval|Return for details/);
reset({rows:[{...pending,status:'PendingBOD',reviewedMinutes:90}]});assert.equal(flatten(render()).filter(e=>e.type==='input'&&e.props.type==='number').length,0);
console.log('PASS: visible rows/requested hours/reasons, explicit legacy status, one-click send, edited amount approval, optional approval note, return reason, blocked exclusion, read-only and BOD amount lock.');

const groupsFor=(template)=>[0,1,2].map(i=>({week:{...week,version:`v${i}`,summary:{...week.summary,weekStart:`2026-09-${7+i*7}`,quantitiesMissing:false}},rows:[{...template,id:`r${i}`,date:`2026-09-${8+i*7}`}]}));
reset({groups:groupsFor(row)});
assert.equal(flatten(render()).filter(e=>e.type==='footer').length,1,'One action bar for all weeks');
assert.equal(flatten(render()).filter(e=>e.type==='textarea').length,1,'One shared note');
assert.equal(flatten(render()).filter(e=>e.type==='table').length,3,'Keep all weekly tables visible');
find('button','Select all 3 to send').props.onClick();
await find('button','to manager for approval').props.onClick();
assert.deepEqual(calls.map(c=>Array.from(c.ids)),[['r0'],['r1'],['r2']]);
assert.equal(new Set(calls.map(c=>c.operation)).size,3,'Separate idempotency identity per server batch');
assert.equal(messages.length,1,'Refresh once after all weeks, never between weeks');
assert.match(messages[0],/3 requests.*3 weeks/);

reset({groups:groupsFor(pending)});
find('button','Select all 3 eligible').props.onClick();
flatten(render()).find(e=>e.type==='input'&&e.props['aria-label']==='Approved OT hours 2026-09-15 r1').props.onChange({target:{value:'1.25'}});
await find('button','Approve 3 selected').props.onClick();
assert.deepEqual(calls.map(c=>c.version),['v0','v1','v2'],'Keep each server weekly version');
assert.equal(calls[1].minutes.r1,75,'Preserve modified hours across weeks');
assert.equal(messages.length,1);assert.match(messages[0],/3 awaiting BOD/);

const normalDecision=service.decideOtWeek;
let failed=false;
service.decideOtWeek=async(...args)=>{const result=await normalDecision(...args);if(args[0][0]==='r1'&&!failed){failed=true;throw Error('Connection interrupted');}return result;};
reset({groups:groupsFor(pending)});find('button','Select all 3 eligible').props.onClick();
await find('button','Approve 3 selected').props.onClick();
assert.equal(messages.length,0,'Keep review and retry state after interruption');
assert.equal(calls.length,2);const uncertainOperation=calls[1].operation;
assert.match(renderToStaticMarkup(render()),/1 requests completed.*Connection interrupted/);
assert.deepEqual(Array.from(state[0]),['r1','r2'],'Only unfinished weeks remain selected');
await find('button','Approve 2 selected').props.onClick();
assert.deepEqual(calls.map(c=>Array.from(c.ids)),[['r0'],['r1'],['r1'],['r2']],'Never repeat completed week');
assert.equal(calls[2].operation,uncertainOperation,'Retry ambiguous response using the same operation ID');
assert.equal(messages.length,1);
service.decideOtWeek=normalDecision;

let release;service.sendPayrollOt=async(rows,operation,note)=>{calls.push({ids:rows.map(r=>r.id),operation,note});await new Promise(resolve=>{release=resolve;});return[];};
reset({groups:groupsFor(row).slice(0,1)});find('button','Select all 1 to send').props.onClick();
const sendClick=find('button','to manager for approval').props.onClick;
const first=sendClick();await sendClick();assert.equal(calls.length,1,'Double-click must not duplicate requests');release();await first;
console.log('PASS: three-week send/approve, edited amounts, weekly versions/BOD routing, one refresh, partial failure, idempotent retry and double-click guard.');

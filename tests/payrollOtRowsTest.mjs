// Actual React row component and handlers; mocked RPCs, no production calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const code=ts.transpileModule(fs.readFileSync('components/overtime/OtRequestReviewList.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const minutesLabel=n=>n==null?'Not confirmed':`${Math.floor(n/60)}h${n%60?` ${n%60}m`:''}`;
let state=[],refs=[],index=0,refIndex=0,calls=[],messages=[];
const service={minutesLabel,workDateLabel:d=>d,sendPayrollOt:async(rows,operation,note)=>{calls.push({action:'send',ids:rows.map(r=>r.id),operation,note});return rows;},decideOtWeek:async(ids,minutes,version,operation,action,note)=>{calls.push({ids,minutes,version,operation,action,note});return [{result:{status:'PendingBOD'}}];}};
const exports={};
vm.runInNewContext(code,{exports,crypto:globalThis.crypto,require:name=>name==='react'?{...React,useState:initial=>{const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:initial=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});}}:name.endsWith('manualOtService')?service:{supabase:{}}});
const row={id:'one',updated_at:'2026-09-30T00:00:00Z',date:'2026-09-08',start_time:'18:30',end_time:'20:30',reason:'Closing coverage',requestedMinutes:120,reviewedMinutes:null,finalMinutes:null,status:'Approved',canSend:true,canDecide:false,blocked:null,managerName:'Sample Manager',history_log:[]};
const week={employeeId:'sample',employee:{name:'Sample Employee',position:'Cashier',businessUnit:'Sample BU'},version:'version',requests:[row],summary:{weekStart:'2026-09-07',weekEnd:'2026-09-13',regularMinutes:2880,approvedMinutes:null,reviewedMinutes:0,projectedMinutes:null,thresholdMinutes:3000,quantitiesMissing:true}};
let props;
function reset(overrides={}){state=[];refs=[];calls=[];messages=[];props={week,rows:[row],readOnly:false,onChanged:m=>messages.push(m),...overrides};}
function render(){index=0;refIndex=0;return exports.WeekRows(props);}
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

import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, Link} from 'react-router-dom';

const compile = (path, deps) => {
  const source=readFileSync(path,'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{assert.ok(name in deps,name);return deps[name];}});
  return exports;
};
const Card=compile('components/payroll/ScheduleTaskCard.tsx',{react:React,'react-router-dom':{Link}}).default;
const person = (id,publication='Published',complete=true,exempt=false) => ({id,name:'Fixture Employee',exempt,complete,publication,days:[],missingDates:[]});
const selected={managerId:'fixture-manager',managerName:'Fixture Manager',week:'2026-11-09',deadline:'2026-11-07T15:59:00Z',required:22,completed:22,remaining:0,exempt:0,percentage:100,status:'Completed',hr:false,employees:Array.from({length:22},(_,i)=>person(String(i)))};
const old={...selected,week:'2026-09-14',status:'Overdue',remaining:3,completed:19};
const render=(task,extra={})=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Card,{task,onRefresh(){},...extra})));
const current=html=>html.slice(0,html.indexOf('</section>'));

const published=render({...selected,overdueTasks:[old]}, {details:true});
assert.match(current(published),/>Published</);
assert.match(current(published),/All 22 employee schedules are already published/);
assert.doesNotMatch(current(published),/Overdue|OVERDUE|Complete this week|remaining to complete|Review &amp; publish/);
assert.match(published,/Previous weeks · 1 with missing schedule records/);
assert.match(published,/do not block approval or publication/);
assert.match(published,/week=2026-09-14&amp;manager=fixture-manager/);
assert.match(published,/Review this older week/);
const drafts=render({...selected,employees:[person('draft','Draft'),...selected.employees.slice(1)],overdueTasks:[old]}, {onReviewPublish(){}});
assert.match(current(drafts),/Awaiting publication/);
assert.match(current(drafts),/1 employee has saved schedules awaiting publication/);
assert.match(current(drafts),/<button[^>]*>Review &amp; publish this week<\/button>/);
assert.doesNotMatch(current(drafts),/Overdue|OVERDUE/);
const incomplete=render({...selected,completed:21,remaining:1,percentage:95,status:'Due Tomorrow',employees:[person('missing','Draft',false),...selected.employees.slice(1)],overdueTasks:[old]});
assert.match(current(incomplete),/Due Tomorrow/);
assert.match(current(incomplete),/1 employee remaining to complete schedules/);
assert.match(current(incomplete),/week=2026-11-09&amp;manager=fixture-manager/);
assert.doesNotMatch(current(incomplete),/>Overdue</);
assert.match(current(render({...selected,remaining:2,status:'Overdue'})),/>Overdue</,'A genuinely overdue selected week stays overdue');
assert.match(render({...selected,required:0,completed:0,employees:[]}),/No employee schedules are required/);
assert.doesNotMatch(render({...selected,overdueTasks:[{...old,remaining:0},{...old,week:selected.week}]}),/Previous weeks/);
assert.match(render({...selected,employees:[person('draft','Draft'),...selected.employees.slice(1)]}),/<a[^>]*>Review &amp; publish this week<\/a>/);

// Invoke the rendered control itself: review opens the existing modal; it never approves automatically.
let reviewed=0,refreshed=0;
const controls=[];
function walk(element){if(!element||typeof element!=='object')return;if(element.type==='button')controls.push(element);React.Children.forEach(element.props?.children,walk);}
walk(Card({task:{...selected,employees:[person('draft','Draft'),...selected.employees.slice(1)]},onRefresh:()=>refreshed++,onReviewPublish:()=>reviewed++,reviewDisabled:true}));
const review=controls.find(control=>String(control.props.children).includes('Review'));
assert.equal(review.props.disabled,true);
review.props.onClick();controls.find(control=>control.props.children==='Refresh progress').props.onClick();
assert.equal(reviewed,1);assert.equal(refreshed,1);

// Exercise the real request wrapper through a week switch, focus refresh and account switch.
let states=[],cursor=0,previousDeps,cleanup,effect,owner='fixture-user';
const requests=[],focus=new Map();
const deps={react:{...React,useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(fn,values){if(!previousDeps||values.some((value,i)=>value!==previousDeps[i])){previousDeps=values;effect=fn;}}},'react-router-dom':{Link},'../../hooks/useAuth':{useAuth:()=>({user:owner?{id:owner}:null})},'../../services/supabaseClient':{supabase:{rpc(name,args){let resolve;const promise=new Promise(r=>resolve=r);requests.push({name,args,resolve});return promise;}}},'../../components/payroll/ScheduleTaskCard':{default:Card},'../../components/payroll/SuspensionStatusReport':{default:()=>null}};
// Window is injected only for the wrapper's event lifecycle.
const source=readFileSync('modules/scheduleCompliance/index.tsx','utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const exports={};vm.runInNewContext(output,{exports,JSON,window:{addEventListener:(event,fn)=>focus.set(event,fn),removeEventListener:(event,fn)=>{if(focus.get(event)===fn)focus.delete(event);}},require:name=>{assert.ok(name in deps,name);return deps[name];}});
function wrapper(week){cursor=0;return exports.ScheduleTask({week,manager:'fixture-manager'});}
function effects(){if(effect){cleanup?.();cleanup=effect();effect=null;}}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
wrapper(selected.week);effects();assert.equal(requests[0].name,'get_schedule_compliance');assert.equal(requests[0].args.p_week,selected.week);
wrapper('2026-11-16');effects();
requests[0].resolve({data:selected,error:null});await flush();
assert.equal(wrapper('2026-11-16').props.role,'status','Old week cannot overwrite selected week');
requests[1].resolve({data:{...selected,week:'2026-11-16'},error:null});await flush();
assert.equal(wrapper('2026-11-16').props.task.week,'2026-11-16');
focus.get('focus')();focus.get('focus')();
requests[3].resolve({error:{message:'Check unavailable'}});await flush();
requests[2].resolve({data:selected,error:null});await flush();
assert.equal(wrapper('2026-11-16').props.role,'alert','Late refresh cannot hide the latest failure');
owner='another-fixture-user';assert.equal(wrapper('2026-11-16').props.role,'status','Previous account status is hidden before effects');effects();
owner=null;assert.equal(wrapper('2026-11-16'),null);effects();assert.equal(focus.size,0);
if(process.env.SCHEDULE_PREVIEW_PATH)writeFileSync(process.env.SCHEDULE_PREVIEW_PATH,`<!doctype html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-100 p-5"><main class="mx-auto max-w-5xl">${published}${drafts}</main></body></html>`);
console.log('PASS: selected-week vs historical status, published/draft/incomplete/exempt actions, review modal control, correct RPC scope, stale-response protection, error display and account switching.');

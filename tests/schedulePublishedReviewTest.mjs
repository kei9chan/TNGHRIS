import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const source=ts.transpileModule(readFileSync('components/payroll/SchedulePublishReview.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
function render(rows){
 let index=0;const state=[rows,false,false,'','','',false,''];
 const react={...React,useState:initial=>[state[index++]??initial,()=>{}],useRef:initial=>({current:initial}),useEffect:()=>{}};
 const module={exports:{}};
 vm.runInNewContext(source,{exports:module.exports,require:name=>name==='react'?{...react,default:react}:name.endsWith('/Modal')?{default:p=>React.createElement('section',null,p.children,p.footer)}:name.endsWith('/Button')?{default:({children,isLoading,variant,...props})=>React.createElement('button',props,children)}:{}});
 return renderToStaticMarkup(React.createElement(module.exports.default,{scope:'direct',ids:rows.map(r=>r.employeeId),week:'2026-09-28',label:'Sep 28 – Oct 4',excluded:0,onClose(){},onPublished(){},onFix(){}}));
}
const row={employeeId:'fixture',name:'Fixture',businessUnit:'Fixture',ready:true,published:true,pending:false,saved:7,restDays:1,absences:0,issues:[]};
const done=render([row]);
assert.match(done,/already published/);
assert.match(done,/No further publishing is needed/);
assert.match(done,/>Done<\/button>/);
assert.doesNotMatch(done,/<textarea/);
assert.doesNotMatch(done,/Publish schedules for this week<\/button>/);
const ready=render([{...row,published:false}]);
assert.match(ready,/<textarea/);
assert.match(ready,/Publish schedules for this week<\/button>/);
assert.doesNotMatch(ready,/No further publishing is needed/);
console.log('PASS: completed weeks show Done without a dead publish form; changed drafts retain the publish form.');

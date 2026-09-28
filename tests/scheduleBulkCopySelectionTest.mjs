import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync('pages/payroll/Timekeeping.tsx','utf8');
const ast=ts.createSourceFile('Timekeeping.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const initializer=name=>{
  let result;
  const visit=node=>{
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)result=node.initializer.getText(ast);
    ts.forEachChild(node,visit);
  };
  visit(ast);
  assert.ok(result,`${name} must exist`);
  return ts.transpileModule(`(${result})`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
};

const roster=[{id:'report',canEdit:true},{id:'viewer',canEdit:false}];
const editable=vm.runInNewContext(initializer('editableEmployees'),{employeesInBU:roster});
assert.deepEqual(Array.from(editable,e=>e.id),['report']);

let calls=0,message='';
const scope={setBuilderError:value=>message=value,runScheduleOperation:async(_,ids,operation)=>{
  assert.deepEqual(Array.from(ids),['report']);
  await operation();
},supabase:{rpc:async(_,payload)=>{calls++;assert.deepEqual(Array.from(payload.p_employees),['report']);return {error:null};}},toDateOnly:()=> '2026-09-28',weekStart:new Date('2026-09-28T00:00:00')};
const copy=vm.runInNewContext(initializer('copyWeek'),scope);
await copy([]);
assert.equal(calls,0);
assert.match(message,/No editable employees/);
await copy(['report']);
assert.equal(calls,1);
assert.match(source,/disabled=\{builderLoading\|\|shiftBusy\|\|!!retryShift\|\|!!operationRetry\.current\|\|!editableEmployees\.length\} onClick=\{handleCopyPreviousWeekAll\}/);
console.log('PASS: bulk copy uses roster edit rights, disables during loading, and never calls the server with an empty employee list.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('pages/payroll/Timekeeping.tsx','utf8');
const ast=ts.createSourceFile('Timekeeping.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function expression(name){let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return ts.transpileModule('('+found+')',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;}
const templates=[{id:'own',businessUnitId:'bu',canUse:true},{id:'historical',businessUnitId:'bu',canUse:false},{id:'other-bu',businessUnitId:'elsewhere',canUse:true}];
const context={builderPeople:[{id:"employee",businessUnitId:"bu"}],templates,selectedBuId:'bu',drawerState:{employee:{businessUnitId:'bu'}},useMemo:fn=>fn(),resolveAssignmentBuId:()=> 'bu'};
for(const name of ['templatesForDrawer','presetTemplates'])assert.deepEqual(Array.from(vm.runInNewContext(expression(name),context),x=>x.id),['own']);
const canUse=vm.runInNewContext(expression('hasScopedPreset'),context);
assert.equal(canUse('employee','own'),true);assert.equal(canUse('employee','historical'),false);
assert.equal(templates.find(t=>t.id==='historical').id,'historical','Historical rendering still resolves the saved assignment');
console.log('PASS: inaccessible historical shifts remain displayable but are excluded from preset choices, assignment drawer and copy eligibility.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file=ts.createSourceFile('ApprovalCenter.tsx',readFileSync(new URL('../pages/ApprovalCenter.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect,reset,defaults;
function visit(n){
 if(ts.isCallExpression(n)&&n.expression.getText(file)==='useEffect'&&n.arguments[0]?.getText(file).includes("searchParams.get('type')"))effect=n.arguments[0].getText(file);
 if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='showAllPending')reset=n.initializer.getText(file);
 if(ts.isVariableDeclaration(n)&&n.name.getText(file)==='DEFAULT_FILTERS')defaults=n.initializer.getText(file);
 ts.forEachChild(n,visit);
}visit(file);
const DEFAULT_FILTERS=vm.runInNewContext('('+defaults+')');let filters,expanded,selected,url;
const scope={DEFAULT_FILTERS,GROUP_ORDER:['wfh','pan','nte','overtime'],setFilters:v=>{filters=typeof v==='function'?v(filters):v;},setExpanded:v=>{expanded=v;},setSelected:v=>{selected=v;},navigate:v=>{url=v;}};
function enter(search){filters={...DEFAULT_FILTERS,kind:'asset',search:'old search',businessUnit:'old BU',quick:'overdue'};scope.searchParams=new URLSearchParams(search);vm.runInNewContext(ts.transpileModule('('+effect+')()',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);}
enter('');assert.equal(filters.kind,'');assert.equal(filters.search,'');assert.equal(filters.businessUnit,'');assert.equal(filters.quick,'all');
for(const kind of scope.GROUP_ORDER){enter('type='+kind);assert.equal(filters.kind,'');assert.equal(expanded,kind);assert.equal(filters.search,'');assert.equal(filters.quick,'all');}
enter('type=invalid');assert.equal(filters.kind,'');
enter('type=wfh&item=test');vm.runInNewContext('('+reset+')()',scope);assert.equal(filters.kind,'');assert.equal(url,'/approvals');assert.equal(selected.size,0);
console.log('PASS: fresh visits clear stale filters; category links expand a row without filtering other categories; Show all clears category URL and selection.');

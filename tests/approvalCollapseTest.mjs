import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const file=ts.createSourceFile('ApprovalCenter.tsx',readFileSync(new URL('../pages/ApprovalCenter.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let body;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0]?.getText(file).includes('const preferred ='))body=node.arguments[0].body.getText(file);
 ts.forEachChild(node,visit);
}
visit(file);assert.ok(body);
const code=ts.transpileModule(`function refresh() ${body}; refresh();`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const initialized={current:false};let expanded=null;
const refresh=(kinds,filter='')=>vm.runInNewContext(code,{filters:{kind:filter},activeGroupKinds:kinds,expansionInitialized:initialized,setExpanded:value=>{expanded=typeof value==='function'?value(expanded):value;}});
refresh([]);refresh(['wfh','pan']);assert.equal(expanded,'wfh');
expanded=null;refresh(['wfh','pan']);assert.equal(expanded,null,'Collapse survives refresh');
refresh(['wfh'],'wfh');assert.equal(expanded,null,'Selected filter must not override collapse');
expanded='pan';refresh(['wfh','pan']);assert.equal(expanded,'pan','Open PAN survives refresh');
refresh(['wfh']);assert.equal(expanded,null,'Removed group closes');
refresh(['wfh','pan']);assert.equal(expanded,null,'Reappearing data must not force-open a group');
console.log('PASS: initial expansion, user collapse, filters, polling, removed and reappearing groups.');

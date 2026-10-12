import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter} from 'react-router-dom';

function load(path,require){
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,require});return exports;
}

// Warm and route loads share one import; failed warmup remains retryable.
let imports=0,fail=true;
const pageModule={__esModule:true,default:()=>null};
const loader=load('services/approvalPageLoader.ts',()=>{imports++;if(fail)throw Error('offline');return pageModule;});
const first=loader.preloadApprovalPage();
assert.equal(loader.preloadApprovalPage(),first);
await assert.rejects(first,/offline/);assert.equal(imports,1);
fail=false;loader.warmApprovalPage();const retry=loader.preloadApprovalPage();
assert.equal(await retry,pageModule);assert.equal(imports,2);
await loader.preloadApprovalPage();assert.equal(imports,2);

// Execute footer links/intent handlers, including an already-active Approvals tab.
const links=[];let warms=0;
const nav=load('services/approvalNavigation.ts',()=>{});
const footer=load('components/layout/MobileFooter.tsx',name=>{
 if(name==='react')return React;
 if(name==='react-router-dom')return{NavLink:props=>{links.push(props);return React.createElement('a',{href:props.to},props.children);}};
 if(name.endsWith('usePermissions'))return{usePermissions:()=>({can:()=>true})};
 if(name.endsWith('types'))return{Permission:{View:'view'}};
 if(name.endsWith('approvalNavigation'))return nav;
 if(name.endsWith('approvalPageLoader'))return{warmApprovalPage:()=>warms++};
 throw Error(name);
});
const html=renderToStaticMarkup(React.createElement(footer.default));
assert.match(html,/href="\/approvals#pending-approvals"/);
const approvals=links.find(link=>link.to===nav.PENDING_APPROVALS_LINK);
approvals.onFocus();approvals.onPointerEnter();assert.equal(warms,2);
const router=createMemoryRouter([{path:'/approvals',element:null}],{initialEntries:['/approvals?type=overtime']});
await router.navigate(approvals.to);
assert.equal(router.state.location.search,'');assert.equal(router.state.location.hash,'#pending-approvals');
const entryKey=router.state.location.key;
await router.navigate(approvals.to);
assert.notEqual(router.state.location.key,entryKey,'Tapping the active footer tab creates a fresh entry for scroll/history reset');
router.dispose();

// The actual route has an inner Suspense boundary: a cold page cannot suspend
// the entire authenticated layout while its code loads.
const source=fs.readFileSync('App.tsx','utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let route;
function visit(node){
 if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='Route'&&node.getText(ast).includes('<ApprovalCenter')&&node.attributes.properties.some(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(ast)==='path'&&prop.initializer?.getText(ast)==='"approvals"'))route=node;
 ts.forEachChild(node,visit);
}visit(ast);assert.ok(route);
const element=route.attributes.properties.find(prop=>prop.name?.getText(ast)==='element');
const expr=element.initializer.expression.getText(ast);
const held=new Promise(()=>{});
const Lazy=React.lazy(()=>held);
const jsx=loadExpression(expr,{React,ProtectedRoute:({children})=>children,ApprovalCenter:Lazy});
function loadExpression(expression,values){
 const code=ts.transpileModule(`export const view=${expression}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
 const exports={};vm.runInNewContext(code,{exports,...values});return exports.view;
}
const shell=renderToStaticMarkup(React.createElement(React.Suspense,{fallback:'Whole app blocked'},React.createElement('main',null,React.createElement('nav',null,'Mobile navigation'),jsx)));
assert.match(shell,/Mobile navigation/);assert.match(shell,/Loading pending requests/);assert.ok(!shell.includes('Whole app blocked'));
console.log('PASS: preloading deduplication/retry, pending footer destination and intent loading, and immediate route-local loading with navigation retained.');

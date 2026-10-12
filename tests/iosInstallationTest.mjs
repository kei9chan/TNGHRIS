import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

function load(path,globals={},dependencies={}){
  const source=fs.readFileSync(path,'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{
    if(name==='react')return {__esModule:true,default:React,...React};
    if(name in dependencies)return dependencies[name];
    throw Error('Unexpected import: '+name);
  },...globals});
  return exports;
}
const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1';
function environment(userAgent=safari,{standalone=false,platform='iPhone',touch=5,clipboard}={}){
  const navigator={userAgent,platform,maxTouchPoints:touch,standalone,clipboard};
  const window={location:{origin:'https://hris.thenextperience.com'},matchMedia:()=>({matches:standalone})};
  const globals={navigator,window};
  const install=load('services/hrisInstallation.ts',globals);
  const guide=load('components/notifications/HrisInstallGuide.tsx',globals,{'../../services/hrisInstallation':install});
  const page=load('pages/InstallHris.tsx',globals,{'../services/hrisInstallation':install,'../components/notifications/HrisInstallGuide':guide});
  return {globals,install,guide,page};
}
let e=environment();
assert.equal(e.install.isIosDevice(),true);
assert.equal(e.install.isIosEmbeddedBrowser(),false);
let html=renderToStaticMarkup(React.createElement(e.page.default));
assert.match(html,/Safari/);assert.match(html,/Open as Web App/);assert.match(html,/Edit Actions/);assert.match(html,/Copy HRIS link/);
assert.match(html,/iOS \/ iPadOS 16.4 or later/);
assert.equal(e.install.hrisInstallUrl(),'https://hris.thenextperience.com/');
assert.equal(environment(safari.replace('18_4','26_0')).install.isIosDevice(),true);
e=environment('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',{platform:'MacIntel'});
assert.equal(e.install.isIosDevice(),true,'iPad desktop user agent is detected');
for(const ua of [safari+' Gmail/6.0',safari+' GSA/355.0',safari+' Instagram 355.0','Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148']){
  e=environment(ua);assert.equal(e.install.isIosEmbeddedBrowser(),true);
  assert.match(renderToStaticMarkup(React.createElement(e.page.default)),/Open this link in Safari first/);
}
e=environment(safari.replace('Version/18.4','CriOS/140.0'));
assert.equal(e.install.isIosEmbeddedBrowser(),false,'iOS Chrome uses guidance without a false webview warning');
e=environment(safari,{standalone:true});
html=renderToStaticMarkup(React.createElement(e.page.default));
assert.match(html,/HRIS is already open as an app/);assert.match(html,/Set up phone notifications/);assert.doesNotMatch(html,/Copy HRIS link/);
e=environment('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',{platform:'Linux armv8l'});
assert.equal(e.install.isIosDevice(),false);
assert.match(renderToStaticMarkup(React.createElement(e.page.default)),/Install app or Add to Home Screen/);

// Execute the real copy handler, including the clipboard-denied/manual-copy path.
let copied='',notice='',focused=false,selected=false;
function copyButton(env){
  const react={__esModule:true,default:React,...React,
    useState:init=>[typeof init==='function'?init():init,v=>{notice=v;}],
    useRef:()=>({current:{focus:()=>{focused=true;},select:()=>{selected=true;}}})};
  const code=ts.transpileModule(fs.readFileSync('components/notifications/HrisInstallGuide.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,...env.globals,require:n=>n==='react'?react:env.install});
  const find=node=>{
    if(!node)return null;
    if(Array.isArray(node)){for(const child of node){const found=find(child);if(found)return found;}return null;}
    if(node.props?.children==='Copy HRIS link')return node;
    return node.props?find(node.props.children):null;
  };
  return find(exports.default({}));
}
await copyButton(environment(safari,{clipboard:{writeText:async value=>{copied=value;}}})).props.onClick();
await new Promise(setImmediate);assert.equal(copied,'https://hris.thenextperience.com/');assert.match(notice,/Link copied/);
await copyButton(environment(safari,{clipboard:{writeText:async()=>{throw Error('Denied');}}})).props.onClick();
await new Promise(setImmediate);assert.equal(focused,true);assert.equal(selected,true);assert.match(notice,/Touch and hold/);

// The existing phone card must not invoke Android's install prompt on an iPhone.
e=environment();
const phone={isIPhone:e.install.isIosDevice,isHomeScreen:e.install.isStandaloneApp,canInstall:()=>true,
  pushSupported:()=>false,defaultPhonePreferences:{assignments:true,reminders:true,coverage:true}};
const card=load('components/notifications/PhoneNotificationSetup.tsx',e.globals,{
  '../../hooks/useAuth':{useAuth:()=>({user:{id:'fixture'}})},
  '../../services/phonePushService':phone,'./HrisInstallGuide':e.guide});
html=renderToStaticMarkup(React.createElement(card.default));
assert.match(html,/iPhone installation steps/);assert.match(html,/Open as Web App/);
assert.doesNotMatch(html,/>Install HRIS<\/button>/);
assert.match(html,/<button[^>]*disabled=""[^>]*>Enable phone notifications/);
console.log('PASS: iPhone/iOS 26/iPad detection, embedded-browser handoff, Safari instructions, missing Share action, clipboard fallback, installed-app state, Android guidance, and notifications gated until installation.');

import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const dir=await mkdtemp(join(tmpdir(),'auth-render-'));
try {
 await build({stdin:{contents:`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {PermissionsProvider,usePermissionsContext} from './context/PermissionsContext';
 export function identity(){return PermissionsProvider({children:null}).key;}
 function Guard(){const p=usePermissionsContext();return <span>{p.loadingPermissions?'Loading authorization':p.effectiveRbac?.authorized?'Allowed':'Denied'}</span>;}
 export function render(){return renderToStaticMarkup(<PermissionsProvider><Guard/></PermissionsProvider>);}
 `,resolveDir:process.cwd(),loader:'tsx'},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},bundle:true,platform:'node',format:'esm',outfile:join(dir,'render.mjs'),plugins:[{name:'isolated-auth',setup(b){
 b.onResolve({filter:/hooks\/useAuth$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/services\/(supabaseClient|rbacService)$/},()=>({path:'backend',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='auth'?'export const useAuth=()=>({user:globalThis.testAuthUser,refreshUser:async()=>{}});':'export const supabase={};export const isTransientNetworkError=()=>false;export const fetchEffectiveRbacSnapshot=()=>{throw Error("No backend calls during render");};'}));
 }}]});
 const {identity,render}=await import(join(dir,'render.mjs'));
 globalThis.testAuthUser=null;const signedOut=identity();
 globalThis.testAuthUser={id:'employee-a',authUserId:'auth-a'};const first=identity();
 assert.notEqual(first,signedOut,'Login must create a fresh permissions state before effects');
 assert.equal(render(),'<span>Loading authorization</span>');
 globalThis.testAuthUser={id:'employee-a',authUserId:'auth-a',name:'Updated profile'};
 assert.equal(identity(),first,'Same-account profile refresh must preserve state');
 globalThis.testAuthUser={id:'employee-b',authUserId:'auth-b'};
 assert.notEqual(identity(),first,'Another account cannot inherit access state');
 assert.equal(render(),'<span>Loading authorization</span>');
 globalThis.testAuthUser={id:'employee-c'};
 assert.equal(identity(),'employee-c');
 assert.equal(render(),'<span>Loading authorization</span>');
 console.log('Initial authorization render and account isolation checks passed');
} finally {delete globalThis.testAuthUser;await rm(dir,{recursive:true,force:true});}

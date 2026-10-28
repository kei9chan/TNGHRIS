import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Module,{createRequire} from 'node:module';
const h=globalThis.signatureUiFixture={contexts:{},key:'root',index:0,pending:[],changed:false,acceptCalls:0,invoke:null};
globalThis.window={devicePixelRatio:1,open(){},print(){}};
const bundle=await build({entryPoints:['pages/OfferResponse.tsx'],bundle:true,jsx:'transform',tsconfigRaw:{compilerOptions:{jsx:'react'}},platform:'node',format:'cjs',write:false,plugins:[{name:'fixtures',setup(b){
b.onResolve({filter:/^react$|^react-router-dom$|supabaseClient$|offerPdf$/},a=>({path:a.path,namespace:'mock'}));
b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='react'?`
 const h=globalThis.signatureUiFixture;const context=()=>h.contexts[h.key]??=( {state:[],deps:[]} );
 export const useState=initial=>{const c=context(),i=h.index++;if(!(i in c.state))c.state[i]=typeof initial==='function'?initial():initial;return[c.state[i],next=>{const value=typeof next==='function'?next(c.state[i]):next;if(!Object.is(value,c.state[i])){c.state[i]=value;h.changed=true}}]};
 export const useRef=value=>{const c=context(),i=h.index++;return c.state[i]??={current:value}};
 export const useEffect=(fn,deps)=>{const c=context(),i=h.index++;if(!c.deps[i]||deps.some((v,j)=>!Object.is(v,c.deps[i][j]))){c.deps[i]=deps;h.pending.push(fn)}};
 export default {forwardRef:fn=>fn,createElement:(type,props,...children)=>({type,props:{...props,children}})};
 `:a.path==='react-router-dom'?`export const useParams=()=>({token:'fixture-token'});`:a.path.endsWith('supabaseClient')?`export const supabase={functions:{invoke:(...args)=>globalThis.signatureUiFixture.invoke(...args)}};`:`export const downloadOfferPdf=async()=>{throw new Error('Fixture PDF generation failed')};`}));
}}]});
const filename=process.cwd()+'/signature-ui-fixture.cjs';const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(process.cwd());mod.require=createRequire(filename);mod._compile(bundle.outputFiles[0].text,filename);const View=mod.exports.default;
let record={id:'fixture',offerNumber:'FIXTURE',status:'Viewed',startDate:'2026-11-01',expirationDate:'2026-10-31',basePay:25000,candidateName:'Fixture Candidate',details:{jobTitle:'Fixture role'}};
let release;h.invoke=async(_,{body})=>{if(body.action==='get')return {data:{offer:record},error:null};if(body.action==='accept'){h.acceptCalls++;return await new Promise(r=>release=r)}};
let tree;const render=(fn=View,props={},key='root')=>{h.key=key;for(let i=0;i<12;i++){h.index=0;h.pending=[];h.changed=false;const t=fn(props);for(const effect of h.pending)effect();if(!h.changed)return t;}throw new Error('Render did not settle')};
const nodes=t=>!t||typeof t!=='object'?[]:[t,...(t.props?.children||[]).flat(Infinity).flatMap(nodes)];const text=t=>typeof t==='string'?t:!t||typeof t!=='object'?'':(t.props?.children||[]).flat(Infinity).map(text).join(' ');
const flush=async()=>{await new Promise(r=>setImmediate(r));tree=render()};
tree=render();await flush();nodes(tree).find(n=>text(n)==='Accept Offer'&&n.props?.onClick).props.onClick();tree=render();
const signature=()=>nodes(tree).find(n=>n.type?.name==='SignatureModal');assert.equal(signature().props.open,true);
const payload={signatureName:'Fixture Candidate',signatureType:'typed',consent:true};signature().props.onSubmit(payload);signature().props.onSubmit(payload);assert.equal(h.acceptCalls,1,'Immediate duplicate click must submit once');tree=render();assert.equal(signature().props.busy,true);
release({data:null,error:{message:'Non-2xx response',context:{json:async()=>({error:'Fixture request could not be saved. Try again.'})}}});await flush();assert.equal(signature().props.open,true);assert.equal(signature().props.busy,false);assert.match(signature().props.submissionError,/could not be saved/);
const modal=render(signature().type,signature().props,'modal');assert.ok(nodes(modal).some(n=>n.props?.role==='alert'&&text(n).includes('Fixture request could not be saved')),'API error must be visible inside the open signature modal');
signature().props.onSubmit(payload);assert.equal(h.acceptCalls,2,'Failure releases submission lock for retry');record={...record,status:'Accepted and Signed',acceptedAt:'2026-10-28T03:00:00Z',signedAt:'2026-10-28T03:00:00Z',signatureName:'Fixture Candidate'};
const oldError=console.error;console.error=()=>{};release({data:{ok:true,status:'Accepted and Signed',respondedAt:'2026-10-28T03:00:00Z'},error:null});await flush();console.error=oldError;assert.equal(signature().props.open,false);assert.ok(text(tree).includes('Offer accepted and signed'),'PDF failure cannot erase recorded acceptance');assert.ok(text(tree).includes('Download Signed Offer'));
console.log('PASS: actual candidate UI locks duplicate submits, surfaces server errors inside the signature modal, retries failures, and completes acceptance despite PDF generation failure.');

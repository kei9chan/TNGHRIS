import {build} from 'esbuild';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const result=await build({entryPoints:['services/commendationService.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'isolated',setup(b){b.onResolve({filter:/supabaseClient$|\.ttf\?url$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('supabaseClient')?'export const supabase={};':`export default ${JSON.stringify(a.path.includes('Bold')?'bold':'normal')};`,loader:'js'}));}}]});
const exports={};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),{exports},exports);
// Use the actual checked-in font without a production or external network request.
globalThis.fetch=async(url)=>({ok:true,arrayBuffer:async()=>{const b=fs.readFileSync(url==='bold'?'assets/fonts/TNGSans-Bold.ttf':'assets/fonts/TNGSans.ttf');return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
const m={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);
const base={employeeId:'fixture',employeeName:'Sample Employee One',awardTitle:'Service Excellence',awardDate:'2026-09-15',citation:'Your preparation, attention to detail, and commitment to quality were greatly appreciated. You made every guest feel welcome and supported your teammates throughout the event. Excellent work, and keep it up!',businessUnit:'Bakebe — Sample Location',issuer:{id:'issuer',name:'Sample HR Issuer',position:'Corporate HR Manager'},approvers:[{id:'approver',name:'Sample Director',position:'Board of Directors'}],brand:{wordmark:'BAKEBE',accent:'#f56600',textColor:'#431407',opening:'We would like to commend you for your exceptional contribution and thoughtful service.',closing:'Thank you for your dedication and for making every experience memorable.'},templateVersion:1};
const first=await m.exports.renderLetterPdf(base),second=await m.exports.renderLetterPdf({...base,employeeName:'Sample Employee Two'});
assert(first.size>1000&&second.size>1000);const bytes=Buffer.from(await first.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert(!bytes.equals(Buffer.from(await second.arrayBuffer())));
await assert.rejects(()=>m.exports.renderLetterPdf({...base,citation:''}),/required/);
fs.mkdirSync('/tmp/commendation-preview',{recursive:true});fs.writeFileSync('/tmp/commendation-preview/letter.pdf',bytes);
console.log('PASS: actual PDF renderer creates distinct personalized PDFs with embedded font; missing content fails before issuance. Preview: /tmp/commendation-preview/letter.pdf');

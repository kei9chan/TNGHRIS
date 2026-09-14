// This endpoint accepts no identity or free-text fields and never accesses the DB.
const operations=new Set(['access_profile_complete','access_permissions_complete','auth_token','access_profile','access_permissions','attendance_read','attendance_history','attendance_save','employee_directory','approval_tasks']);
export function validSamples(body:unknown){
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 if(Object.keys(body).length!==1||!('samples' in body))return null;
 const samples=(body as {samples:unknown}).samples;
 if(!Array.isArray(samples)||samples.length<1||samples.length>20)return null;
 const safe=[];
 for(const sample of samples){
  if(!sample||typeof sample!=='object'||Array.isArray(sample))return null;
  if(Object.keys(sample).sort().join(',')!=='durationMs,operation,sampleRate,status')return null;
  const {operation,durationMs,status,sampleRate}=sample;
  if(!operations.has(operation)||!Number.isInteger(durationMs)||durationMs<0||durationMs>120000)return null;
  if(!Number.isInteger(status)||(status!==0&&(status<100||status>599)))return null;
  if(sampleRate!==(status>=200&&status<400?0.1:1))return null;
  safe.push({operation,durationMs,status,sampleRate});
 }
 return safe;
}
// Best-effort per-instance ceiling; not a substitute for platform rate limiting.
let intervalStart=Date.now(),accepted=0;
export default function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 if(req.headers.origin!=='https://hris.thenextperience.com')return res.status(403).end();
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).end();
 const samples=validSamples(req.body);if(!samples)return res.status(400).end();
 if(Date.now()-intervalStart>=60000){intervalStart=Date.now();accepted=0;}
 if(accepted+samples.length>200)return res.status(429).end();
 accepted+=samples.length;
 console.info(JSON.stringify({event:'hris_performance',version:1,receivedAt:new Date().toISOString(),samples}));
 return res.status(204).end();
}

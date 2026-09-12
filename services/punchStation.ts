// Deliberately separate from the normal Supabase Auth client: no HRIS session is used.
export type Action = 'CLOCK_IN'|'START_BREAK'|'END_BREAK'|'CLOCK_OUT';
export const labels: Record<Action,string> = {CLOCK_IN:'Clock In',START_BREAK:'Start Break',END_BREAK:'End Break',CLOCK_OUT:'Clock Out'};
export class StationRejection extends Error {}
export function actions(state:string):Action[] {
  return state==='not_started'?['CLOCK_IN']:state==='working'?['START_BREAK','CLOCK_OUT']:state==='on_break'?['END_BREAK']:[];
}
export async function stationRpc<T=any>(name:string,args:Record<string,unknown>):Promise<T> {
  const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error('Punch Station is temporarily unavailable. Please try again or contact your supervisor.');
  const value=await response.json();if(value?.error)throw new StationRejection(value.error);return value;
}
const database=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('tng-punch-station',1);r.onupgradeneeded=()=>{r.result.createObjectStore('queue');r.result.createObjectStore('settings');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function operation<T>(store:string,mode:IDBTransactionMode,work:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const request=work(tx.objectStore(store));tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});
}
let keyPromise:Promise<CryptoKey>|undefined;
function encryptionKey(){return keyPromise??=(async()=>{const existing=await operation<CryptoKey>('settings','readonly',s=>s.get('key'));if(existing)return existing;const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await operation('settings','readwrite',s=>s.put(key,'key'));return key;})();}
export async function enqueue(id:string,payload:Record<string,unknown>){
 if((await queued()).length>=200)throw new Error('Offline storage is full. Contact your supervisor before punching.');
 const iv=crypto.getRandomValues(new Uint8Array(12));const key=await encryptionKey();const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(payload)));
 await operation('queue','readwrite',s=>s.put({iv,data},id));
}
export async function queued():Promise<{id:string;payload:any}[]>{
 const keys=await operation<IDBValidKey[]>('queue','readonly',s=>s.getAllKeys());if(!keys.length)return [];
 const key=await encryptionKey();const rows=[];
 for(const id of keys){const row=await operation<any>('queue','readonly',s=>s.get(id));if(!row)continue;const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv},key,row.data);rows.push({id:String(id),payload:JSON.parse(new TextDecoder().decode(raw))});}
 return rows.sort((a,b)=>String(a.payload.p_captured_at).localeCompare(String(b.payload.p_captured_at)));
}
export const removeQueued=(id:string)=>operation('queue','readwrite',s=>s.delete(id));
export async function capture(video:HTMLVideoElement):Promise<string>{
 if(video.readyState<2||!video.videoWidth||!video.srcObject||(video.srcObject as MediaStream).getVideoTracks().every(t=>t.readyState!=='live'))throw new Error('Camera access is required to complete this punch.');
 const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(480*video.videoHeight/video.videoWidth);canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
 const encoded=canvas.toDataURL('image/jpeg',0.65).split(',')[1];if(!encoded||encoded.length>266000)throw new Error('Audit photo could not be captured. Contact your supervisor.');return encoded;
}

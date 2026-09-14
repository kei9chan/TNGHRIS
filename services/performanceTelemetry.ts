// Anonymous, bounded transport timing. Never record URLs, bodies, tokens or IDs.
const paths: Record<string,string> = {
 '/auth/v1/token':'auth_token',
 '/rest/v1/rpc/get_my_hris_bootstrap':'access_profile',
 '/rest/v1/rpc/get_my_effective_rbac':'access_permissions',
 '/rest/v1/rpc/get_my_attendance':'attendance_read',
 '/rest/v1/rpc/get_my_attendance_history':'attendance_history',
 '/rest/v1/rpc/record_my_attendance':'attendance_save',
 '/rest/v1/rpc/record_my_attendance_verified':'attendance_save',
 '/rest/v1/rpc/get_accessible_hris_users':'employee_directory',
 '/rest/v1/rpc/get_my_actionable_approval_tasks':'approval_tasks',
};
type Sample={operation:string;durationMs:number;status:number;sampleRate:number};
let queue:Sample[]=[],timer:ReturnType<typeof setTimeout>|undefined;
let windowStart=Date.now(),sent=0;
export function recordRequestTiming(input:RequestInfo|URL,started:number,status:number){
 try{
  if(typeof window==='undefined'||window.location.hostname!=='hris.thenextperience.com')return;
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw);
  if(url.hostname!=='kpogfmwsxwikfilxhcqh.supabase.co')return;
  const operation=paths[url.pathname];if(!operation)return;
  const sampleRate=status>=200&&status<400?0.1:1;
  if(Math.random()>=sampleRate)return;
  if(Date.now()-windowStart>=3600000){windowStart=Date.now();sent=0;}
  if(sent>=60||queue.length>=20)return;
  sent++;
  queue.push({operation,durationMs:Math.min(120000,Math.max(0,Math.round(performance.now()-started))),status,sampleRate});
  if(!timer)timer=setTimeout(()=>{
   timer=undefined;const samples=queue;queue=[];
   // Best effort: never retry monitoring and never delay the employee's request.
   void fetch('/api/performance',{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({samples})}).catch(()=>{});
  },10000);
 }catch{/* Monitoring cannot break application requests. */}
}

import {buildEmail} from './email.ts';
const env=(k:string)=>Deno.env.get(k)?.trim()||'';
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
 let token:string;try {const input=await req.text();if(input.length>128)throw Error();token=JSON.parse(input).token;}catch{return Response.json({error:'invalid_request'},{status:400});}
 if(typeof token!=='string'||!/^[0-9a-f-]{36}$/.test(token))return Response.json({error:'unauthorized'},{status:401});
 const rpc=async(name:string,args:object)=>{const r=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('database_failed');return r.json();};
 let claim;try{claim=await rpc('claim_nte_employee_email',{p_token:token});}catch{return Response.json({error:'claim_failed'},{status:503});}
 if(!claim)return Response.json({error:'invalid_or_inapplicable'},{status:401});
 let provider:string|null=null,error:string|null=null;
 try{
  const from=env('RESEND_FROM_EMAIL')||env('APPROVAL_EMAIL_FROM');
  if(!env('RESEND_API_KEY')||!from)throw Error('mail_provider_unconfigured');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'Content-Type':'application/json','Idempotency-Key':'nte-employee/'+claim.id},body:JSON.stringify({from,to:[claim.payload.email],...buildEmail(claim.payload)}),signal:AbortSignal.timeout(10000)});
  const result=await response.json().catch(()=>({}));if(!response.ok||typeof result.id!=='string')error='mail_provider_'+response.status;else provider=result.id;
 }catch(e){error=(e as Error).message==='mail_provider_unconfigured'?'mail_provider_unconfigured':'delivery_unconfirmed';}
 try{if(!await rpc('finish_nte_employee_email',{p_token:token,p_provider:provider,p_error:error}))throw Error();}catch{return Response.json({error:'delivery_state_not_saved'},{status:503});}
 return Response.json({status:provider?'sent':'failed',error},{status:provider?200:503});
});

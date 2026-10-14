import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.84.0';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const normalize=(value:unknown)=>String(value||'').trim().toLowerCase();
const boundedFetch=(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(15_000)});
Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return json({error:'Sign in to review deletion requests'},401);
  let body:any;try{body=await request.json();}catch{return json({error:'Invalid request body'},400);}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.requestId||''))||!['approve','reject'].includes(body.decision))return json({error:'Choose a valid deletion request and decision'},400);
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return json({error:'Deletion service is unavailable'},503);
  const scoped=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch,headers:{Authorization:authorization}}});
  const auth=await scoped.auth.getUser();
  if(auth.error||!auth.data.user)return json({error:'Your session expired. Please sign in again.'},401);
  // The database verifies the assigned active BOD and returns a snapshot-bound
  // execution lease. Never accept an Auth user ID or email from the caller.
  const decision=await scoped.rpc('decide_email_account_deletion',{p_request:body.requestId,p_decision:body.decision,p_comment:String(body.comment||'').slice(0,2000)});
  if(decision.error)return json({error:decision.error.message},decision.error.code==='42501'?403:409);
  if(decision.data?.status==='Rejected')return json({ok:true,status:'Rejected'});
  const ticket=decision.data;
  if(!ticket?.authUserId||!ticket.executionToken)return json({error:'The server did not authorize deletion'},409);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
  let removed=false;
  try{
    const existing=await admin.auth.admin.getUserById(ticket.authUserId);
    const alreadyRemoved=ticket.authDeleted===true||existing.error?.status===404||existing.error?.code==='user_not_found'||Boolean((existing.data.user as any)?.deleted_at);
    if(!alreadyRemoved){
      if(existing.error)throw new Error('identity_lookup_failed');
      if(!existing.data.user||normalize(existing.data.user.email)!==normalize(ticket.email))throw new Error('identity_changed');
      // Soft-delete through managed Auth: email/sign-in is removed while IDs and
      // Storage ownership remain available for historical employee records.
      const deleted=await admin.auth.admin.deleteUser(ticket.authUserId,true);
      if(deleted.error)throw new Error('auth_deletion_failed');
    }
    removed=true;
    const completed=await admin.rpc('finish_email_account_deletion',{p_request:ticket.requestId,p_token:ticket.executionToken,p_success:true,p_error:null});
    if(completed.error)throw new Error('finalization_failed');
    return json({ok:true,status:'Completed'});
  }catch(error){
    const message=removed?'Sign-in removal was recorded by Auth, but HRIS completion needs a retry. Kay can retry safely.':(error as Error).message==='identity_changed'?'The sign-in identity changed. Deletion is blocked; review account diagnostics.':'BOD approval was recorded and HRIS access is blocked. Sign-in removal could not complete; Kay can retry.';
    const recorded=await admin.rpc('finish_email_account_deletion',{p_request:ticket.requestId,p_token:ticket.executionToken,p_success:false,p_error:message});
    if(recorded.error)console.error('Email-account deletion needs execution reconciliation');
    return json({error:message},502);
  }
});

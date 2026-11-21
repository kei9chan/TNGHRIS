import {configured,cronAuthorized,env,rpc,sendResend,serviceClient,validEmail} from '../../server/approvalEmail.js';
export const config={maxDuration:300};
export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(!cronAuthorized(req.headers.authorization))return res.status(401).json({error:'Unauthorized'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!configured())return res.status(503).json({error:'Email configuration incomplete'});
  const db=serviceClient();
  let sent=0,failed=0;
  const stop=Date.now()+240000;
  try {
    await rpc(db,'ops_queue_checklist_mail');
    while(Date.now()<stop){
      const mail=await rpc(db,'ops_claim_checklist_mail');
      if(!mail)break;
      try {
        if(!validEmail(mail.email))throw new Error('Invalid recipient');
        const url=new URL('/operations',env('APP_BASE_URL'));
        url.searchParams.set('view',mail.unit?'Review':'Checklist Results');
        if(mail.unit)url.searchParams.set('unit',mail.unit);
        const provider=await sendResend({from:env('APPROVAL_EMAIL_FROM'),to:[mail.email],subject:mail.subject,
          text:mail.message+'\n\nOpen Operations Station: '+url.toString()},'ops-checklist-'+mail.id);
        await rpc(db,'ops_finish_checklist_mail',{p_id:mail.id,p_token:mail.token,p_provider:provider});
        sent++;
      } catch {failed++;}
    }
    return res.status(failed?503:200).json({sent,failed});
  } catch {return res.status(503).json({error:'Checklist delivery run failed',sent,failed});}
}

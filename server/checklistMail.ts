import {env,rpc,sendResend,validEmail} from './approvalEmail.js';

export async function deliverChecklistMail(db:Parameters<typeof rpc>[0]){
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
        url.searchParams.set('view',mail.subject.startsWith('Checklist summary')?'Needs attention':'Checklist history');
        if(mail.unit)url.searchParams.set('unit',mail.unit);
        const provider=await sendResend({from:env('APPROVAL_EMAIL_FROM'),to:[mail.email],subject:mail.subject,
          text:mail.message+'\n\nOpen Operations Station: '+url.toString()},'ops-checklist-'+mail.id);
        await rpc(db,'ops_finish_checklist_mail',{p_id:mail.id,p_token:mail.token,p_provider:provider});
        sent++;
      } catch {failed++;}
    }
    return {sent,failed};
  } catch {return {sent,failed:failed+1};}
}

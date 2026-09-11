import {noticeHtml} from '../../server/noticeEmail.js';
import {configured,cronAuthorized,env,rpc,sendResend,serviceClient,validEmail} from '../../server/approvalEmail.js';
export const config={maxDuration:300};
export default async function handler(req:any,res:any){
 res.setHeader('Cache-Control','no-store');
 if(!cronAuthorized(req.headers.authorization))return res.status(401).json({error:'Unauthorized'});
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!configured())return res.status(503).json({error:'Existing email configuration is incomplete'});
 const db=serviceClient();let sent=0,failed=0;const end=Date.now()+240000;
 try{
  await rpc(db,'queue_schedule_compliance_reminders');
  while(Date.now()<end){
   const c=await rpc(db,'claim_schedule_compliance_email');if(!c)break;if(c.skipped)continue;
   let provider:string|null=null,error:string|null=null;
   try{
    const p=c.payload;if(!validEmail(p.email))throw new Error('No valid recipient email');
    const schedule=new URL(`/payroll/timekeeping?week=${p.week}&manager=${p.managerId}`,env('APP_BASE_URL')).toString();
    const dashboard=new URL(p.event==='HR escalation'?'/payroll/schedule-compliance':'/dashboard#schedule-task',env('APP_BASE_URL')).toString();
    const deadline=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'full',timeStyle:'short'}).format(new Date(p.deadline));
    const missing='Open Set Schedules to view employees and missing dates.';
    const week=new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(p.week+'T00:00:00Z'));
    const heading=p.status==='Overdue'?'Employee schedules are overdue':'Complete next week’s employee schedules';
    provider=await sendResend({from:env('APPROVAL_EMAIL_FROM'),to:[p.email],subject:`${p.status==='Overdue'?'Overdue':'Action Required'}: Complete Employee Schedules — week of ${p.week}`,
     html:noticeHtml({title:heading,intro:`${p.managerName}, ${p.remaining} employees still need completed schedules.`,badge:p.status,urgent:p.status==='Overdue',facts:[['Schedule week',`${week} · Monday–Sunday`],['Deadline',`${deadline} Philippine time`],['Progress',`${p.completed} of ${p.required} completed (${p.percentage}%)`],['Remaining',`${p.remaining} employees`]],actions:[{label:'Set schedules',url:schedule},{label:'View schedule compliance',url:dashboard}]}),
     text:`${p.managerName}\n\n${heading}\nSchedule week: ${p.week} (Monday–Sunday)\nDeadline: ${deadline} Philippine time\n${p.completed} of ${p.required} completed (${p.percentage}%). ${p.remaining} employees remaining.\nStatus: ${p.status}\n\n${missing}\n\nSet Schedules: ${schedule}\nDashboard / Compliance: ${dashboard}\n\nCompletion is based on saved schedules. No attendance or payroll records are changed by this reminder.`},`schedule-${c.id}`);
   }catch(e){error=(e as Error).message;}
   await rpc(db,'finish_schedule_compliance_email',{p_id:c.id,p_token:c.token,p_provider:provider,p_error:error});
   if(provider)sent++;else {failed++;await new Promise(resolve=>setTimeout(resolve,1500));}
  }
  return res.status(failed?503:200).json({sent,failed});
 }catch{return res.status(503).json({error:'Schedule reminder run failed; review delivery audit',sent,failed});}
}

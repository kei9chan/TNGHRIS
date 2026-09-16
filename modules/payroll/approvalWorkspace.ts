import {supabase} from '../../services/supabaseClient';
import type {Approval,ApprovalSummary} from './approvals';
export type WorkspaceApproval=ApprovalSummary&{actions:Approval['actions']};
export type ApprovalPage={items:WorkspaceApproval[];hasMore:boolean;nextOffset:number;checkedAt:string};
export type NextApproval={label:string;owner:string;path:string};
export function nextApproval(r:ApprovalSummary):NextApproval{
 const open=`/payroll/approvals?run=${r.id}`;
 if(!r.current||r.returned)return {label:'Revise and resubmit this payroll version',owner:'Finance preparer',path:open};
 if(r.paid)return {label:'Review payment reconciliation and pilot monitoring',owner:'HR / Finance',path:'/payroll/pilot'};
 if(r.step>=6)return r.mode==='shadow'?{label:'Review formal comparison and pilot evidence',owner:'HR / Finance',path:'/payroll/pilot'}:{label:'Review controlled payment release',owner:'Finance release officer',path:`/payroll/payments?run=${r.id}`};
 return {label:r.stage,owner:r.step<2?'HR reviewer / endorser':r.step===2?'HR Manager':r.step===3?'Finance authorizer':'Board of Directors — independent reviewer',path:open};
}
export async function workspaceApprovals(scope:string,from:string|null=null,to:string|null=null,offset=0):Promise<ApprovalPage>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const {data,error}=await supabase.rpc('get_payroll_workspace_approvals',{p_scope:scope,p_from:from,p_to:to,p_offset:offset}).abortSignal(controller.signal);
 if(controller.signal.aborted)throw new Error('Approval status took too long. Refresh to retry.');if(error)throw new Error(error.message);return data as ApprovalPage;
 }finally{clearTimeout(timer);}
}

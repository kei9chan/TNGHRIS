import {supabase} from './supabaseClient';

export type EmailAccountDeletionRequest = {
  id: string; targetId: string; employeeName: string; email: string; reason: string;
  requestedBy: string; status: 'Pending'|'Approved'|'Rejected'|'Completed';
  executionStatus: 'Not started'|'Executing'|'Failed'|'Completed';
  createdAt: string; completedAt?: string; decisionComment?: string; error?: string; isActionable: boolean;
};
export type EmailAccountDeletionWorkspace = {
  canRequest: boolean; canApprove: boolean; approverName?: string;
  targets: {id:string}[]; requests: EmailAccountDeletionRequest[];
};
export const emptyDeletionWorkspace: EmailAccountDeletionWorkspace = {canRequest:false,canApprove:false,targets:[],requests:[]};
export async function fetchEmailAccountDeletionWorkspace(): Promise<EmailAccountDeletionWorkspace> {
  const {data,error}=await supabase.rpc('get_email_account_deletion_workspace');
  if(error) throw new Error(error.message);
  return data || emptyDeletionWorkspace;
}
export async function requestEmailAccountDeletion(targetId:string,email:string,reason:string,requestId:string): Promise<void> {
  const {error}=await supabase.rpc('request_email_account_deletion',{p_target:targetId,p_reason:reason,p_confirm_email:email,p_request:requestId});
  if(error) throw new Error(error.message);
}
export async function decideEmailAccountDeletion(requestId:string,decision:'approve'|'reject',comment:string): Promise<void> {
  const {data,error}=await supabase.functions.invoke('email-account-deletion',{body:{requestId,decision,comment}});
  if(error){
    let message=error.message;
    try {const body=await error.context?.json();if(body?.error)message=body.error;} catch {/* Preserve the transport error. */}
    throw new Error(message);
  }
  if(!data?.ok) throw new Error(data?.error || 'The deletion decision could not be completed.');
}

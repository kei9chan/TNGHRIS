import {supabase} from '../../services/supabaseClient';
export const approvalStages=['HR validation','HR endorsement','HR Manager authorization','Finance authorization','BOD approval 1 of 2','BOD approval 2 of 2'];
export type Approval={id:string;step:number;stage:string;current:boolean;returned:boolean;paid:boolean;mode:string;canAct:boolean;canDisburse:boolean;staleReason:string|null;reference:string;contact:string;source:{kind:string;version:number;from:string;to:string;payDate:string;gross:string;deductions:string;net:string;employees:{employeeId:string;employeeName:string;gross:string;deductions:string;net:string;tax:string;lines:{label:string;amount:string;remaining?:string}[]}[]};actions:{step:number;stage:string;action:string;actor:string;at:string;reason:string}[]};
export type ApprovalSummary=Omit<Approval,'source'|'actions'>&{from:string;to:string;kind:string;version:number};
async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const listApprovals=()=>rpc<ApprovalSummary[]>('list_payroll_approvals');
export const getApproval=(id:string)=>rpc<Approval>('get_payroll_approval',{p_run_id:id});
export const submitApproval=(net:string|null,special:string|null,ref:string,contact:string)=>rpc<string>('submit_payroll_for_approval',{p_net_id:net,p_special_id:special,p_reference:ref,p_contact:contact});
export const actApproval=(id:string,step:number,action:string,reason:string)=>rpc<void>('act_on_payroll_approval',{p_run_id:id,p_step:step,p_action:action,p_reason:reason});
export const recordDisbursement=(id:string,ref:string,date:string,amount:string)=>rpc<string>('record_payroll_disbursement',{p_run_id:id,p_reference:ref,p_paid_on:date,p_amount:amount});
export type Payslip={paymentStatus?:string;unpaid?:string;id:string;employeeName:string;from:string;to:string;payDate:string;gross:string;deductions:string;net:string;tax:string;contact:string;releasedAt:string;lines:{label:string;amount:string}[];contributions:{label:string;amount:string}[];loans:{account:string;amount:string}[];otherDeductions:{label:string;amount:string}[]};
export const listMyPayslips=()=>rpc<{id:string;from:string;to:string;net:string;releasedAt:string}[]>('list_my_payroll_payslips');
export const getMyPayslip=(id:string)=>rpc<Payslip>('get_my_payroll_payslip',{p_id:id});

import {supabase} from '../../services/supabaseClient';
import type {Approval} from './approvals';

export const processCodes = [
 ['bank','Existing bank / payment process'],['1601_c','BIR 1601-C'],
 ['1604_c','BIR 1604-C / alphalist'],['2316','BIR 2316'],['sss','SSS'],
 ['philhealth','PhilHealth'],['pagibig','Pag-IBIG'],['special_pay','Special-pay settlement'],
] as const;
export const outputKinds = [
 ['register','Payroll register'],['finance','Finance summary'],['payment_preview','Payment review'],
 ['tax','BIR source workpaper'],['agency','Contribution workpaper'],['payment_schedule','Authorized payment schedule'],
] as const;
export type PaymentRow={employeeId:string;employeeName:string;due:string;confirmed:string;pending:string;unpaid:string;available:string;complete:boolean};
export type PaymentEvent={id:number;status:string;occurred_on:string;reference:string;reason:string};
export type PaymentAttempt={id:string;employee_id:string;amount:string;reference:string;scheduled_on:string;status:string;lastEvent:number;reissue_of:string|null;bankChanged:boolean;events:PaymentEvent[]};
export type PaymentWorkspace={approval:Approval;batch:{id:string;reference:string;closed:boolean}|null;rows:PaymentRow[];attempts:PaymentAttempt[];canRelease:boolean;canRecordOutcome:boolean;blockedReason:string;totals:{net:string;confirmed:string;pending:string;unpaid:string};loanAdjustments:{id:string;kind:string;amount:string;reason:string}[];exports:{id:string;kind:string;at:string;hash:string;downloadRequests:number}[]};
export type OutputProcess={code:string;owner:string;owner_id:string;ownerActive:boolean;process_ref:string};
export type OutputSetup={scopes:{id:string;name:string;canManage:boolean;processes:OutputProcess[]}[];owners:{id:string;name:string}[]};
export type OutputPayload=Record<string,unknown>;
async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getPaymentWorkspace=(id:string)=>rpc<PaymentWorkspace>('get_payroll_payment_workspace',{p_run_id:id});
export const getOutputSetup=()=>rpc<OutputSetup>('get_payroll_output_setup');
export const recordOutputProcess=(scope:string,code:string,owner:string,reference:string)=>rpc<void>('record_payroll_output_process',{p_scope_id:scope,p_code:code,p_owner_id:owner,p_reference:reference});
export const createPaymentBatch=(run:string,reference:string)=>rpc<string>('create_payroll_payment_batch',{p_run_id:run,p_reference:reference});
export const closePaymentBatch=(batch:string,reason:string)=>rpc<void>('close_payroll_payment_batch',{p_batch_id:batch,p_reason:reason});
export const preparePaymentAttempt=(batch:string,employee:string,amount:string,reference:string,date:string,reissue:string|null)=>rpc<string>('prepare_payroll_payment_attempt',{p_batch_id:batch,p_employee_id:employee,p_amount:amount,p_reference:reference,p_scheduled_on:date,p_reissue_of:reissue});
export const recordPaymentOutcome=(attempt:string,expected:number,status:string,date:string,reference:string,reason:string,request:string)=>rpc<number>('record_payroll_payment_outcome',{p_attempt_id:attempt,p_expected_event:expected,p_status:status,p_occurred_on:date,p_reference:reference,p_reason:reason,p_request_id:request});
export const completePaymentBatch=(batch:string,reference:string)=>rpc<string>('complete_payroll_payment_batch',{p_batch_id:batch,p_reference:reference});
export const createOutput=(run:string,kind:string)=>rpc<string>('create_payroll_output',{p_run_id:run,p_kind:kind});
export const downloadOutput=(id:string)=>rpc<OutputPayload>('download_payroll_output',{p_export_id:id});

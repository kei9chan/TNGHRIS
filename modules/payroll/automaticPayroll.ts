import {supabase} from '../../services/supabaseClient';
import {netWorkspace,type NetInputs,type NetWorkspace,type PackageTerms} from './netPay';

export type PayrollInputIssue={employeeId:string;employeeName:string;items:{code:string;message:string}[]};
export type AutomaticPayrollInputs={ready:boolean;inputs:NetInputs;issues:PayrollInputIssue[];packageTerms:PackageTerms[]};
export type AutomaticPayrollResult={ready:boolean;runId?:string;issues:PayrollInputIssue[]};
export async function automaticPayrollWorkspace(id:string):Promise<NetWorkspace>{
 const w=await netWorkspace(id);
 if(!w.canReview||!w.gross.current)return w;
 const {data,error}=await supabase.rpc('get_automatic_payroll_inputs',{p_gross_id:id});
 if(error)throw new Error(`Automatic payroll records could not load: ${error.message}`);
 const prepared=data as AutomaticPayrollInputs;
 return {...w,packageTerms:prepared.packageTerms,automaticIssues:prepared.issues,
  review:{id:w.review?.id||'automatic',inputs:prepared.inputs,sourceRef:w.review?.sourceRef||'Approved payroll records',approvedAt:w.review?.approvedAt||''}};
}
// A calculation writes a draft: never retry it automatically after an uncertain response.
export async function calculateAutomaticPayroll(id:string):Promise<AutomaticPayrollResult>{
 const {data,error}=await supabase.rpc('calculate_automatic_payroll',{p_gross_id:id});
 if(error)throw new Error(`${error.message} Refresh saved payroll versions before retrying calculation.`);
 return data as AutomaticPayrollResult;
}

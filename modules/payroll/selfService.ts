import {supabase} from '../../services/supabaseClient';
export type PayLine={kind?:string;category?:string;settled?:string;label?:string;amount?:string;remaining?:string;date?:string;quantity?:string;rate?:string;factor?:string;start?:string;end?:string;account?:string;sourceRef?:string;monthly?:string;prior?:string};
export type EmployeePayslip={id:string;runId:string;employeeName:string;employeeNumber?:string;businessUnit?:string;from:string;to:string;payDate:string;version:string;payrollStatus:string;paymentStatus?:string;unpaid?:string;releasedAt:string;gross:string;deductions:string;net:string;tax:string;contact:string;lines:PayLine[]|null;contributions:PayLine[]|null;loans:PayLine[]|null;otherDeductions:PayLine[]|null;items:{key:string;label:string}[];correctionKind?:string;originalPayslipId?:string};
export const issueCategories=['Missing overtime','Incorrect working hours','Incorrect leave deduction','Incorrect allowance','Incorrect salary or rate','Unexpected deduction','Missing payment','Other payroll issue'];
export type IssueSummary={id:string;category:string;submittedAt:string;employeeName:string;from:string;to:string;status:string};
export type PayrollIssue={id:string;payslip_id:string;category:string;item_label:string;affected_date?:string;explanation:string;expected_correction?:string;submitted_at:string;status:string;revision:number;own:boolean;canHR:boolean;canFinance:boolean;payslip:EmployeePayslip;events:{id:string;revision:number;status:string;public_response:string;internal_note?:string;occurred_at:string}[];attachments:{id:string;object_path:string;file_name:string}[];adjustments:{id:string;description:string;created_at:string}[];correction?:{corrected_payslip_id:string;correction_kind:string;linked_at:string;approvals:{stage:string;approvedBy:string;approvedAt:string}[]}};
export async function payrollRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const myPayslips=()=>payrollRpc<EmployeePayslip[]>('list_payroll_self_service_payslips');
export const myPayslip=(id:string)=>payrollRpc<EmployeePayslip>('get_payroll_self_service_payslip',{p_id:id});
export const getIssue=(id:string)=>payrollRpc<PayrollIssue>('get_payroll_issue',{p_id:id});
export const listIssues=(review=false)=>payrollRpc<IssueSummary[]>('list_payroll_issues',{p_review:review});
export const canReviewIssues=()=>payrollRpc<boolean>('payroll_issue_review_available');
export async function uploadIssueFile(issue:string,file:File){
 const types:Record<string,string>={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg'};
 if(!types[file.type]||file.size>5*1024*1024)throw new Error('Choose a PDF, PNG or JPEG up to 5 MB.');
 const path=`${issue}/${crypto.randomUUID()}.${types[file.type]}`;
 const {error}=await supabase.storage.from('payroll-issue-support').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
 await payrollRpc('attach_payroll_issue_file',{p_issue:issue,p_path:path,p_name:file.name.slice(0,200)});
}
export async function issueFileUrl(path:string){const {data,error}=await supabase.storage.from('payroll-issue-support').createSignedUrl(path,60);if(error)throw error;return data.signedUrl;}
export const money=(value:unknown)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value??0));
export const inputClass='mt-1 block w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';

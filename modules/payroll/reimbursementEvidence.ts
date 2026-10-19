import {supabase} from '../../services/supabaseClient';
export type CutoffEvidence={id:string;source_hash:string;required_amount:number;supported_amount:number;document_url:string;submitted_at:string;verified_by:string|null;verified_at:string|null;verifiedName:string|null};
export type ReimbursementRow={employeeId:string;employeeName:string;employeeCode:string;requiredAmount:string;calculationReady:boolean;verified:boolean;evidence:CutoffEvidence|null};
export type ReimbursementWorkspace={from:string;to:string;sourceHash:string;actorId:string;canSubmit:boolean;canVerify:boolean;rows:ReimbursementRow[]};
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getReimbursementWorkspace=(timeId:string)=>rpc<ReimbursementWorkspace>('get_payroll_reimbursement_workspace',{p_time_id:timeId});
export const saveReimbursementEvidence=(timeId:string,row:ReimbursementRow,hash:string,amount:string,url:string)=>rpc<string>('save_payroll_reimbursement_evidence',{p_time_id:timeId,p_employee:row.employeeId,p_source_hash:hash,p_supported:amount,p_url:url});
export const verifyReimbursementEvidence=(timeId:string,row:ReimbursementRow,hash:string)=>rpc<void>('verify_payroll_reimbursement_evidence',{p_time_id:timeId,p_employee:row.employeeId,p_source_hash:hash,p_submitted_at:row.evidence?.submitted_at});
export function receiptLinkValid(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='drive.google.com'&&/^\/(file\/d\/|drive\/(u\/\d+\/)?folders\/|open\?id=)[\w-]+/.test(u.pathname+u.search))||(u.hostname==='docs.google.com'&&/^\/spreadsheets\/d\/[\w-]+/.test(u.pathname)));}catch{return false;}}
export function receiptShortfall(required:string,supported:string){return Math.max(0,Math.round((Number(required)-Number(supported||0))*100)/100);}

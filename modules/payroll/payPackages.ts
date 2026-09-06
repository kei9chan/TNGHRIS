import { supabase } from '../../services/supabaseClient';

export const treatmentFields = [['tax','Taxable base'],['sss','SSS base'],['philhealth','PhilHealth base'],['pagibig','Pag-IBIG base'],['thirteenthMonth','13th-month base'],['proration','Proration']] as const;
export type Treatment = Record<string, string>;
export type PayComponent = Treatment & {name: string; amount: string; recurrence: string; legacyField: string; payableDate: string};
export type PayPackage = {
 id: string; scope_id: string; engagement_key: string; stream: string; effective_from: string; effective_until: string | null;
 rate_type: string; base_amount: string | number; components: PayComponent[]; treatment: Treatment; tax_profile_ref: string | null;
 status: string; source_ref: string; reason: string; approved_at: string | null; source_pan_id: string | null;
};
export type PayContext = {
 employeeId: string; name: string; isSelf: boolean; managed: boolean; scopeId: string; canEdit: boolean; canApprove: boolean; sourceHash: string | null;
 scopes: {id: string; name: string; canEdit: boolean; canApprove: boolean}[];
 legacy: {rateType: string | null; rateAmount: number | null; salaryBasic: number | null; deminimis: number | null; reimbursable: number | null; taxStatus: string | null};
 packages: PayPackage[];
 sources: {id:string|null;label:string;baseAmount:number|null;rateType:string|null;deminimis:number|null;reimbursable:number|null;effectiveFrom?:string;conflict:boolean}[];
 sourceMatches:boolean|null;
 settings: {id: string; effective_from: string; holiday_handling: string; policy_ref: string; calendar: {startDay:number;endDay:number;payDay:number;payMonthOffset:number}[]}[];
 bank: {bankName: string;accountLast4: string;accountType: string;fingerprint: string;canVerify:boolean;verified:boolean} | null;
};
async function rpc<T>(name: string, args?: Record<string,unknown>): Promise<T> {
 const {data,error} = await supabase.rpc(name,args);
 if (error) throw new Error(error.message);
 return data as T;
}
export const fetchPayDirectory = () => rpc<{id:string;name:string;employeeCode:string}[]>('get_payroll_package_directory');
export const fetchPayPackages = (id:string) => rpc<PayContext>('get_payroll_pay_packages',{p_employee_id:id});
export const savePayPackage = (id:string,scope:string,payload:Record<string,unknown>,hash:string) => rpc<string>('save_payroll_pay_package',{p_employee_id:id,p_scope_id:scope,p_package:payload,p_source_hash:hash});
export const reviewPayPackage = (id:string,approve:boolean,reason:string) => rpc<void>('review_payroll_pay_package',{p_package_id:id,p_approve:approve,p_reason:reason});
export const verifyPaymentDetails = (id:string,fingerprint:string,source:string) => rpc<void>('verify_payroll_payment_details',{p_employee_id:id,p_fingerprint:fingerprint,p_source_ref:source});
export const savePaySettings = (scope:string,date:string,calendar:unknown,holiday:string,source:string) => rpc<string>('save_payroll_pay_settings',{p_scope_id:scope,p_effective_from:date,p_calendar:calendar,p_holiday_handling:holiday,p_policy_ref:source});
export const emptyTreatment = (): Treatment => Object.fromEntries(treatmentFields.map(([key])=>[key,'unreviewed']));
export const newComponent = (): PayComponent => ({...emptyTreatment(),name:'',amount:'',recurrence:'recurring',legacyField:'',payableDate:''});
export const treatmentPending = (treatment:Treatment) => treatmentFields.some(([key])=>!treatment[key] || treatment[key]==='unreviewed');

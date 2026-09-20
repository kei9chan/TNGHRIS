import {supabase} from '../../services/supabaseClient';

export type ServiceChargeAllocation={
 id:string;employeeId:string;employeeName:string;employeeCode:string|null;businessUnitId:string|null;businessUnit:string;
 classification:string;eligibilityStatus:'Eligible'|'Not eligible'|'Not configured'|'Needs review';selected:boolean;amount:string;
 inclusionStatus:string;reason:string|null;overrideApplied:boolean;overrideReason:string|null;
};
export type ServiceChargeSetup={
 id:string;scope_id:string;period_from:string;period_to:string;pay_date:string;effective_date:string;version:number;previous_id:string|null;
 status:string;pool_amount:string;default_classification:string;classification_filter:string;approved_rule_name:string|null;
 approved_rule_reference:string|null;approved_rule_version:string|null;allocation_basis:string|null;funding_source:string|null;
 selection_notes:string|null;selection_confirmed:boolean;snapshot_id:string|null;allocations:ServiceChargeAllocation[];
 selectedCount:number;excludedCount:number;allocatedAmount:string;unallocatedAmount:string;
};
export type ServiceChargeContext={configured:boolean;canManage:boolean;scopeId?:string;from?:string;to?:string;setup?:ServiceChargeSetup;audit?:{action:string;reason:string|null;at:string;actor:string;previous:unknown;next:unknown}[]};

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getServiceCharge=(scope:string,from:string,to:string,payDate?:string)=>rpc<ServiceChargeContext>('get_payroll_service_charge',{p_scope_id:scope,p_from:from,p_to:to,p_pay_date:payDate||null});
export const initializeServiceCharge=(scope:string,from:string,to:string,payDate:string)=>rpc<string>('initialize_payroll_service_charge',{p_scope_id:scope,p_from:from,p_to:to,p_pay_date:payDate});
export const saveServiceCharge=(setup:ServiceChargeSetup)=>rpc<ServiceChargeSetup>('save_payroll_service_charge',{p_setup_id:setup.id,p_setup:{poolAmount:setup.pool_amount,effectiveDate:setup.effective_date,classificationFilter:setup.classification_filter,approvedRuleName:setup.approved_rule_name,approvedRuleReference:setup.approved_rule_reference,approvedRuleVersion:setup.approved_rule_version,allocationBasis:setup.allocation_basis,fundingSource:setup.funding_source,notes:setup.selection_notes},p_allocations:setup.allocations.map(a=>({employeeId:a.employeeId,selected:a.selected,amount:a.amount,reason:a.reason}))});
export const previewServiceCharge=(id:string)=>rpc<ServiceChargeSetup>('preview_payroll_service_charge',{p_setup_id:id});
export const includeServiceCharge=(id:string)=>rpc<string>('include_payroll_service_charge_snapshot',{p_setup_id:id});
export const reviseServiceCharge=(id:string,reason:string)=>rpc<string>('revise_payroll_service_charge',{p_setup_id:id,p_reason:reason});
export const peso=(value:string|number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);

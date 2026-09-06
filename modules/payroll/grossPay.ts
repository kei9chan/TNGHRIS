import {supabase} from '../../services/supabaseClient';
export type GrossRule={id:string;effective_from:string;effective_to:string;source_ref:string;config:GrossConfig};
export type GrossConfig={monthlyMethod:string;rounding:string;recurringMethod:string;annualDivisor:string;hoursPerDay:string;nightStart:string;nightEnd:string;offsetCash:string;gracePay:string;rateBoundary:string;premiums:Record<string,{regular:string;ot:string;nightRegular:string;nightOt:string}>};
export type GrossScope={id:string;name:string;mode:string;canManage:boolean;canView:boolean;canPrepare:boolean;canConfigure:boolean;canCalculate:boolean;timePackages:{id:string;version:number;from:string;to:string}[];rules:GrossRule[]};
export type GrossLine={label:string;quantity:string;rate:string;factor:string;unrounded:string;amount:string;date?:string;rounding:string;ruleSource?:string;packageSource?:string;packageId?:string;ruleId?:string;eventIds?:string[];shiftIds?:string[];start?:string;end?:string;category?:string;otId?:string;annualDivisor?:string;hoursPerDay?:string;baseRate?:string;rateType?:string};
export type GrossRun={id:string;version:number;previousId:string|null;from:string;to:string;timePackageId:string;engineVersion:string;sourceHash:string;current:boolean;staleReason:string|null;reason:string;result:{gross:string;employees:{employeeId:string;employeeName:string;gross:string;lines:GrossLine[]}[]}};
export type RunSummary={id:string;version:number;from:string;to:string;createdAt:string};
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const grossContext=()=>rpc<{scopes:GrossScope[]}>('get_payroll_gross_context');
export const grossRuns=(scope:string)=>rpc<RunSummary[]>('list_payroll_gross_runs',{p_scope_id:scope});
export const getGrossRun=(id:string)=>rpc<GrossRun>('get_payroll_gross_run',{p_run_id:id});
export const prepareGross=(id:string,reason:string)=>rpc<string>('prepare_payroll_gross',{p_time_package_id:id,p_reason:reason});
export const setShadow=(scope:string,enabled:boolean,reason:string)=>rpc<void>('set_payroll_shadow_mode',{p_scope_id:scope,p_enabled:enabled,p_reason:reason});
export const saveGrossRules=(scope:string,from:string,to:string,config:GrossConfig,ref:string)=>rpc<string>('save_payroll_gross_rules',{p_scope_id:scope,p_from:from,p_to:to,p_config:config,p_source_ref:ref});

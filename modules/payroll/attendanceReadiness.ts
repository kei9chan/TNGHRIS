import {supabase} from '../../services/supabaseClient';
export type TimeScope={id:string;name:string;canView:boolean;canFinalize:boolean;canConfigure:boolean;canManage:boolean};
export type TimeRow={requiresClock?:boolean;attendanceBasis?:string;employeeId:string;employeeName:string;date:string;restDay:boolean;holiday:boolean;approvedFullLeave:boolean;scheduledMinutes:number;actualMinutes:number;regularMinutes:number;breakMinutes:number;lateMinutes:number;undertimeMinutes:number;approvedOtMinutes:number;actualOtMinutes:number;workedLunch:boolean;issues:string[];ready:boolean;shiftIds:string[];eventIds:string[];leaveIds:string[];ot:{id:string;type:string;status:string}[];segments:{date:string;start:string;end:string}[]};
export type TimeResult={engineVersion:string;rows:TimeRow[];blockedDays:number;totalDays:number};
export type TimeRuleConfig={restTemplates:string[];meals:Record<string,string>;holidayCoverageConfirmed:boolean;splitShiftConfirmed:boolean;leavePolicyRef:string;offsetPolicyRef:string};
export type TimePreview={sourceHash:string;result:TimeResult;holidays:{id:string;name:string;date:string;kind:string;source:string}[];templates:{id:string;name:string;start:string;end:string}[];rules:{id:string;effective_from:string;effective_to:string;source_ref:string;config:TimeRuleConfig}[];packages:{id:string;version:number;status:string;current:boolean;blockedDays:number;reason:string;previousId:string|null}[]};
export type OffsetReview={id:string;employeeName:string;date:string;minutes:number;complete:boolean;current:boolean;isSelf:boolean;actions:{stage:string;decision:string;createdAt:string}[]};
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const fetchTimeContext=()=>rpc<{scopes:TimeScope[]}>('get_payroll_time_context');
export const previewTime=(scope:string,from:string,to:string)=>rpc<TimePreview>('preview_payroll_time',{p_scope_id:scope,p_date_from:from,p_date_to:to});
export const saveTime=(scope:string,from:string,to:string,hash:string,reason:string)=>rpc<string>('save_payroll_time_package',{p_scope_id:scope,p_date_from:from,p_date_to:to,p_source_hash:hash,p_reason:reason});
export const submitTime=(id:string)=>rpc<void>('submit_payroll_time_package',{p_package_id:id});
export const fetchTimePackage=(id:string)=>rpc<{id:string;version:number;status:string;current:boolean;result:TimeResult;reason:string}>('get_payroll_time_package',{p_package_id:id});
export const recordTimeRules=(scope:string,from:string,to:string,config:TimeRuleConfig,source:string)=>rpc<string>('save_payroll_time_rules',{p_scope_id:scope,p_date_from:from,p_date_to:to,p_config:config,p_source_ref:source});
export const recordTimeHoliday=(scope:string,date:string,name:string,kind:string,source:string,replaces:string|null)=>rpc<string>('save_payroll_time_holiday',{p_scope_id:scope,p_date:date,p_name:name,p_kind:kind,p_source_ref:source,p_replaces_id:replaces});
export const openOffsetReview=(id:string,reason:string)=>rpc<string>('open_payroll_offset_case',{p_ot_request_id:id,p_reason:reason});
export const reviewOffset=(id:string,approve:boolean,reason:string)=>rpc<void>('review_payroll_offset_case',{p_case_id:id,p_approve:approve,p_reason:reason});
export const fetchOffsetReviews=()=>rpc<OffsetReview[]>('get_my_payroll_offset_reviews');

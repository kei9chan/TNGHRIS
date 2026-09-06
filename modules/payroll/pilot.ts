import {supabase} from '../../services/supabaseClient';
export type CompareRow={employeeId:string;employeeName:string;key:string;label:string;amount:string};
export type CompareInput={sourceRef:string;coverageRef:string;legacyEmployees:string[];rows:{employeeId:string;key:string;legacyAmount:string;explanation:string;policyRef:string}[]};
export type CompareTemplate={runId:string;sourceHash:string;from:string;to:string;rows:CompareRow[]};
export type Comparison={id:string;runId:string;from:string;to:string;sourceRef:string;coverageRef:string;ready:boolean;blockedReason:string|null;canHR:boolean;canFinance:boolean;acceptances:{duty:string;actor:string;reference:string}[];rows:(CompareRow&{legacyAmount:string;difference:string;explanation:string;policyRef:string;resolved:boolean})[]};
export const pilotEvidence=[['handoverRef','Pilot owner, handover cutoff and decision reference'],['legacyStoppedRef','Legacy engine stop and sole payroll ownership evidence'],['taxOpeningRef','Tax / prior-employer / year-to-date reconciliation'],['contributionOpeningRef','Employee and employer contribution openings'],['loanOpeningRef','Loan openings and prior settlements reconciliation'],['inFlightPaymentsRef','In-flight, unpaid and returned legacy payments reconciliation'],['coverageRef','Supported cases and named existing process for unsupported cases']] as const;
export type Proposal={id:string;date_from:string;date_to:string;evidence:Record<string,string>;ready:boolean;blockedReason:string|null;decisions:{actor:string;reference:string}[];canBOD:boolean};
export type PilotWorkspace={scopes:{id:string;name:string;mode:string;canManage:boolean;canView:boolean}[];comparisons:Comparison[];proposals:Proposal[];blockedReason?:string;canPrepare?:boolean;canPropose?:boolean;canHR?:boolean;canFinance?:boolean;processCount?:number;activation?:{id:string;proposal_id:string;continued:boolean;monitoring:{duty:string;reference:string;run_id:string}[]}|null};
async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const pilotWorkspace=(scope:string|null)=>rpc<PilotWorkspace>('get_payroll_pilot_workspace',{p_scope:scope});
export const comparisonTemplate=(id:string)=>rpc<CompareTemplate>('get_payroll_comparison_template',{p_run_id:id});
export const saveComparison=(t:CompareTemplate,input:CompareInput)=>rpc<string>('save_payroll_comparison',{p_run_id:t.runId,p_source_hash:t.sourceHash,p_input:input});
export const acceptComparison=(id:string,duty:string,reference:string)=>rpc<void>('accept_payroll_comparison',{p_id:id,p_duty:duty,p_reference:reference});
export const proposePilot=(scope:string,first:string,second:string,from:string,to:string,evidence:Record<string,string>)=>rpc<string>('propose_payroll_pilot',{p_scope:scope,p_first:first,p_second:second,p_from:from,p_to:to,p_evidence:evidence});
export const approvePilot=(id:string,reference:string)=>rpc<void>('approve_payroll_pilot',{p_id:id,p_reference:reference});
export const activatePilot=(id:string,reference:string)=>rpc<string>('activate_payroll_pilot',{p_id:id,p_reference:reference});
export const reviewPilot=(activation:string,run:string,duty:string,reference:string)=>rpc<void>('review_payroll_pilot',{p_activation:activation,p_run:run,p_duty:duty,p_reference:reference});
export const continuePilot=(activation:string,reference:string)=>rpc<void>('continue_payroll_pilot',{p_activation:activation,p_reference:reference});

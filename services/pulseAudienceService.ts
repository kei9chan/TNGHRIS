import { supabase } from './supabaseClient';
export type PulseAudience = {
 preset: string; businessUnits: string[]; departments: string[]; positions: string[];
 roles: string[]; employmentStatuses: string[]; includeEmployees: string[]; excludeEmployees: string[]; managersOnly: boolean;
};
export const audiencePresets = [
 ['all','All Employees – All Business Units'],['businessUnits','Selected Business Unit(s)'],
 ['managers','Managers Only'],['seasonal','Seasonal Employees Only'],['consultants','Consultants Only'],
 ['nonRegular','Non-Regular Employees Only'],['regular','All Regular Employees'],['custom','Custom audience'],
];
export const emptyAudience = (): PulseAudience => ({preset:'',businessUnits:[],departments:[],positions:[],roles:[],employmentStatuses:[],includeEmployees:[],excludeEmployees:[],managersOnly:false});
export const presetAudience = (preset: string): PulseAudience => ({...emptyAudience(),preset,managersOnly:preset==='managers'});
export async function pulseAudienceRpc<T=any>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export function audienceSummary(value:PulseAudience,options:any):string {
 const label=audiencePresets.find(p=>p[0]===value.preset)?.[1]||'Choose an audience';
 const bu=value.businessUnits.length?value.businessUnits.map(id=>options?.businessUnits?.find((b:any)=>b.id===id)?.name||id).join(', '):'All Business Units';
 return [label.replace(' – All Business Units',''),value.managersOnly&&value.preset!=='managers'?'Managers only':'',value.employmentStatuses.join(', '),bu,value.departments.map(id=>options?.departments?.find((d:any)=>d.id===id)?.name||id).join(', '),value.positions.join(', '),value.roles.join(', '),value.includeEmployees.length?`${value.includeEmployees.length} specific additions`:'',value.excludeEmployees.length?`${value.excludeEmployees.length} exclusions`:''].filter(Boolean).join(' – ');
}

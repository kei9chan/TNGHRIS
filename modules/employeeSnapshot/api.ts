import {supabase} from '../../services/supabaseClient';
import type {Directory,Filters,Snapshot} from './model';
async function read<T>(name:string,args:Record<string,unknown>,signal:AbortSignal):Promise<T>{
 const {data,error}=await supabase.rpc(name,args).abortSignal(signal);
 if(error)throw new Error(error.message);
 return data as T;
}
export const directory=(filters:Record<string,string>,signal:AbortSignal)=>read<Directory>('get_bod_employee_directory',{p_filters:filters},signal);
export const snapshot=(id:string,signal:AbortSignal)=>read<Snapshot>('get_bod_employee_snapshot',{p_employee_id:id},signal);
export const filters=(signal:AbortSignal)=>read<Filters>('get_bod_employee_filters',{},signal);

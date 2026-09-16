import {supabase} from '../../services/supabaseClient';
export type HistoryKind='punches'|'dtr';
export type HistoryRow={line:number;code:string;employeeName?:string;workDate?:string;payload:Record<string,unknown>;errors:string[];duplicate:boolean};
export type HistoryPreview={rows:HistoryRow[];ready:number;invalid:number;duplicates:number};
export type HistoryBatch={id:string;status:'preview'|'imported';filename:string;preview:HistoryPreview;sourceHash:string;duplicateFile?:boolean;sourceBase64?:string;audit?:{id:string;actor:string;action:string;created_at:string;details:Record<string,unknown>}[]};
export type HistoryContext={scopeName:string;businessUnitId:string;canImport:boolean;canCorrect:boolean;employees:{id:string;code:string;name:string}[];batches:{id:string;kind:HistoryKind;filename:string;status:string;reference:string;source_hash:string;created_at:string;created_by:string;imported_records:number;preview_ready:number;preview_invalid:number}[]};
export async function historyRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
 try{const {data,error}=await supabase.rpc(name,args).abortSignal(controller.signal);if(error)throw new Error(error.message);return data as T;}catch(e){if(controller.signal.aborted)throw new Error('The request timed out. Refresh import history before retrying; duplicate requests are safe.');throw e;}finally{clearTimeout(timer);}
}
export const historyContext=(scope:string,from:string,to:string)=>historyRpc<HistoryContext>('get_historical_attendance_context',{p_scope:scope,p_from:from,p_to:to});
export const historyDetail=(id:string,download=false)=>historyRpc<HistoryBatch>('get_historical_attendance_test',{p_batch:id,p_download:download});
export async function stageHistory(scope:string,from:string,to:string,kind:HistoryKind,file:File,reference:string){
 if(!/\.csv$/i.test(file.name)||file.size>524288||!file.size)throw new Error('Choose a CSV UTF-8 file, up to 512 KB and 5,000 rows.');
 const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return historyRpc<HistoryBatch>('stage_historical_attendance_test',{p_scope:scope,p_from:from,p_to:to,p_kind:kind,p_filename:file.name,p_source_base64:btoa(binary),p_reference:reference});
}
export function downloadHistoricalSource(batch:HistoryBatch){
 if(!batch.sourceBase64)throw new Error('Source file could not be loaded.');const binary=atob(batch.sourceBase64.replace(/\s/g,''));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 saveDownload(new Blob([bytes],{type:'text/csv;charset=utf-8'}),batch.filename);
}
export function saveDownload(blob:Blob,name:string){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

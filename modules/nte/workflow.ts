import {supabase} from '../../services/supabaseClient';
export const MAX_ATTACHMENT_BYTES=5*1024*1024;
export const attachmentTypes=['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export function validateAttachment(file:Pick<File,'size'|'type'>){
 if(file.size>MAX_ATTACHMENT_BYTES)throw new Error('The attachment must be 5 MB or smaller.');
 if(!attachmentTypes.includes(file.type))throw new Error('Use a PDF, JPG, PNG or DOCX attachment.');
}
export function validateLink(link:string){if(!link.trim())return;let url:URL;try{url=new URL(link);}catch{throw new Error('Enter a full HTTPS attachment link.');}if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS attachment link without embedded credentials.');}
export const phTime=(value:string)=>!value||!Number.isFinite(Date.parse(value))?'Not recorded':new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})+' PHT';
export const deadlineLabel=(exclusive:string)=>!exclusive||!Number.isFinite(Date.parse(exclusive))?'Not recorded':phTime(new Date(new Date(exclusive).getTime()-1000).toISOString());
// PostgreSQL composite rows with no match may serialize as an object of nulls.
// Normalize at the RPC boundary so absence is not mistaken for a real record.
export function normalizeWorkflow(name:string,data:any){
 if(!data||typeof data!=='object')return data;
 if(name==='get_nte_response_workflow')return {...data,receipt:data.receipt?.nte_id?data.receipt:null,events:Array.isArray(data.events)?data.events:[]};
 if(name==='get_nod_workflow')return {...data,decision:data.decision?.id?{...data.decision,review_fields:data.decision.review_fields||{},approver_steps:Array.isArray(data.decision.approver_steps)?data.decision.approver_steps:[]}:null,implementation:data.implementation?.resolution_id?data.implementation:null};
 return data;
}
export async function workflowRpc<T=any>(name:string,args:Record<string,unknown>={}){const{data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return normalizeWorkflow(name,data) as T;}
export async function uploadResponse(nteId:string,file:File){validateAttachment(file);const path=`${nteId}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const{error}=await supabase.storage.from('nte-response-attachments').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return path;}
export async function openResponseAttachment(path:string){const{data,error}=await supabase.storage.from('nte-response-attachments').createSignedUrl(path,60);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer');}

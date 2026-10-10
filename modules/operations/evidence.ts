import {supabase} from '../../services/supabaseClient';
import {operationsRpc} from './service';
export async function compressEvidencePhoto(file:File):Promise<File>{
 if(!file.type.startsWith('image/')||file.size>20*1024*1024)throw new Error('Choose a photo up to 20 MB. JPEG, PNG or WebP is recommended.');
 let source:ImageBitmap|HTMLImageElement;let sourceUrl='';
 try{source=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{sourceUrl=URL.createObjectURL(file);const img=new Image();img.src=sourceUrl;try{await img.decode();source=img;}catch{URL.revokeObjectURL(sourceUrl);throw new Error('This photo cannot be read. Please use JPEG, PNG or WebP.');}}
 try{
  const canvas=document.createElement('canvas');const width=source.width,height=source.height;if(!width||!height)throw new Error('Photo is empty.');const scale=Math.min(1,1280/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo compression is unavailable on this browser.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);
  let blob:Blob|null=null;for(const quality of [.82,.72,.62,.55]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=400*1024)break;}
  if(!blob||blob.size>500*1024)throw new Error('Photo is too detailed to fit 500 KB. Retake closer to the item or reading.');
  return new File([blob],'evidence.jpg',{type:'image/jpeg'});
 }finally{if('close' in source)source.close();if(sourceUrl)URL.revokeObjectURL(sourceUrl);}
}
export async function uploadEvidence(item:string,file:File){
 const reservation=await operationsRpc<{id:string;path:string}>('ops_prepare_evidence',{p_item:item,p_bytes:file.size});
 try{const {error}=await supabase.storage.from('ops-evidence').upload(reservation.path,file,{contentType:'image/jpeg',cacheControl:'0',upsert:false});if(error)throw new Error(error.message);await operationsRpc('ops_finish_evidence',{p_id:reservation.id});}
 catch(e){try{await operationsRpc('ops_remove_evidence',{p_id:reservation.id,p_note:'Upload failed; discard reservation'});}catch{}throw e;}
}
export async function downloadEvidence(path:string):Promise<string>{const {data,error}=await supabase.storage.from('ops-evidence').download(path);if(error||!data)throw new Error(error?.message||'Photo unavailable or expired.');return URL.createObjectURL(data);}

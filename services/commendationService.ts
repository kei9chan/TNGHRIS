import {supabase} from './supabaseClient';
import fontUrl from '../assets/fonts/TNGSans.ttf?url';
import boldFontUrl from '../assets/fonts/TNGSans-Bold.ttf?url';
export type LetterTemplate = {id:string;name:string;business_unit_id:string|null;award_type_id:string|null;version:number;active:boolean;config:LetterBrand};
export type LetterBrand = {wordmark:string;accent:string;textColor:string;opening:string;closing:string;logo?:string;signatures?:{userId:string;image:string}[]};
export type LetterSnapshot = {employeeId:string;employeeName:string;awardTitle:string;awardDate:string;citation:string;businessUnit:string;issuer:{id:string;name:string;position:string};approvers:{id:string;name:string;position:string}[];brand:LetterBrand;fallback?:boolean;templateVersion:number};
export type AwardLetter = {award_id:string;template_id:string;template_version:number;snapshot:LetterSnapshot;file_path:string;state:'Draft'|'Issued'|'Withdrawn';last_error?:string;opened_at?:string;acknowledged_at?:string;issued_at?:string};
export async function letterAction(id:string,action:string,payload:Record<string,unknown>={}) {
 const {data,error}=await supabase.rpc('award_letter_action',{p_id:id,p_action:action,p_payload:payload});
 if(error)throw new Error(error.message);return data as AwardLetter;
}
export async function fetchLetterTemplates() {
 const {data,error}=await supabase.from('commendation_templates').select('*').order('name');
 if(error)throw new Error(error.message);return (data||[]) as LetterTemplate[];
}
export function selectLetterTemplate(templates:LetterTemplate[],bu:string,award:string) {
 return templates.filter(t=>t.active&&(!t.business_unit_id||t.business_unit_id===bu)&&(!t.award_type_id||t.award_type_id===award))
 .sort((a,b)=>Number(!!b.business_unit_id)-Number(!!a.business_unit_id)||Number(!!b.award_type_id)-Number(!!a.award_type_id))[0];
}
let fontPromise:Promise<string[]>|undefined;
export async function renderLetterPdf(s:LetterSnapshot):Promise<Blob> {
 if(!s.employeeName||!s.citation.trim()||!s.brand.wordmark)throw new Error('Employee, commendation and branded template are required.');
 const {jsPDF}=await import('jspdf');
 fontPromise ||= Promise.all([fontUrl,boldFontUrl].map(url=>fetch(url).then(async response=>{if(!response.ok)throw Error('Letter font could not be loaded.');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}))).catch(error=>{fontPromise=undefined;throw error});
 const pdf=new jsPDF({unit:'mm',format:'a4'});
 const [normal,bold]=await fontPromise;pdf.addFileToVFS('TNG.ttf',normal);pdf.addFont('TNG.ttf','TNG','normal');pdf.addFileToVFS('TNG-Bold.ttf',bold);pdf.addFont('TNG-Bold.ttf','TNG','bold');pdf.setFont('TNG');
 const decorate=()=>{pdf.setFillColor('#fffdf8');pdf.rect(0,0,210,297,'F');pdf.setFillColor(s.brand.accent);pdf.rect(0,0,9,297,'F');pdf.setTextColor(s.brand.textColor);pdf.setFontSize(9);pdf.text(`${s.businessUnit} · Template v${s.templateVersion}`,25,288);};
 decorate();
 if(s.brand.logo)pdf.addImage(s.brand.logo,s.brand.logo.startsWith('data:image/jpeg')?'JPEG':'PNG',25,16,40,18);
 else {pdf.setFont('TNG','bold');pdf.setFontSize(24);pdf.text(s.brand.wordmark,25,28,{maxWidth:158});pdf.setFont('TNG','normal');}
 let y=57;
 const write=(text:string,size=11,gap=6)=>{pdf.setFontSize(size);const lines=pdf.splitTextToSize(text,158);for(const line of lines){if(y>264){pdf.addPage();decorate();y=25;}pdf.text(line,25,y);y+=gap;}y+=5;};
 pdf.setFont('TNG','bold');write('LETTER OF COMMENDATION',21,9);pdf.setFont('TNG','normal');write(s.awardTitle,13,7);write(new Date(s.awardDate+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}));y+=5;
 write(`Dear ${s.employeeName},`);write(s.brand.opening);write(s.citation);write(s.brand.closing);y+=8;
 const signers=[{...s.issuer,label:'Awarded by'},...s.approvers.map(p=>({...p,label:'Approved by'}))];
 y=Math.max(y,220);
 for(let index=0;index<signers.length;index+=2){if(y>230){pdf.addPage();decorate();y=25;}signers.slice(index,index+2).forEach((person,column)=>{const x=25+column*84;pdf.setFontSize(10);pdf.text(person.label,x,y);const signature=s.brand.signatures?.find(sig=>sig.userId===person.id);if(signature?.image)pdf.addImage(signature.image,signature.image.startsWith('data:image/jpeg')?'JPEG':'PNG',x,y+3,38,13);pdf.setDrawColor('#bbbbbb');pdf.line(x,y+20,x+72,y+20);pdf.setFont('TNG','bold');pdf.text(pdf.splitTextToSize(person.name,72),x,y+26);pdf.setFont('TNG','normal');pdf.text(pdf.splitTextToSize(person.position,72),x,y+35);});y+=53;}
 return pdf.output('blob');
}
export async function issueCommendation(id:string) {
 const letter=await letterAction(id,'prepare');
 try {
  // Reuse a successfully stored snapshot on retry; never overwrite an issued file.
  const existing=await supabase.storage.from('award-commendations').download(letter.file_path);
  if(!existing.data){
   const blob=await renderLetterPdf(letter.snapshot);
   const {error}=await supabase.storage.from('award-commendations').upload(letter.file_path,blob,{contentType:'application/pdf',upsert:false});
   if(error)throw new Error(error.message);
  }
  return await letterAction(id,'finalize');
 } catch(error) {
  await letterAction(id,'error',{message:error instanceof Error?error.message:'Letter generation failed'}).catch(()=>{});
  throw error;
 }
}
export async function downloadLetter(letter:AwardLetter) {
 const {data,error}=await supabase.storage.from('award-commendations').download(letter.file_path);
 if(error||!data)throw new Error(error?.message||'Letter could not be downloaded.');
 return data;
}

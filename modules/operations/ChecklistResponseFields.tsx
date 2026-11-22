import React,{useState} from 'react';
import type {OpsContent,OpsResponse,OpsRunItem} from './types';
import {buttonClass,Field,inputClass} from './ui';

type Value=OpsRunItem['response']['value'];
type Props={snapshot:OpsContent;type:OpsResponse;value:Value;change:(v:Value)=>void;remarks:string;setRemarks:(v:string)=>void;issue:boolean;setIssue:(v:boolean)=>void;maintenance?:boolean;checklist?:boolean;onPick?:(v:Value,issue:boolean)=>void};

export default function ChecklistResponseFields({snapshot,type,value,change,remarks,setRemarks,issue,setIssue,maintenance=false,checklist=false,onPick}:Props){
 const [manualReading,setManualReading]=useState(false);
 const degrees=snapshot.unit==='°C'?Array.from({length:51},(_,index)=>index-30):[];
 const customReading=manualReading||(typeof value==='number'&&!degrees.includes(value));
 const na=value==='na';
 const [noteOpen,setNoteOpen]=useState(false);
 const basic=checklist && (type==='none'||type==='yes_no') && !snapshot.safety_critical && !snapshot.photo_required;
 if(basic){
   const selected=na?'na':issue||value==='no'?'no':value===true||value==='yes'?'done':'';
   return <div className="space-y-3">
     <div role="group" aria-label={snapshot.title} className="grid grid-cols-3 gap-2">
       {[
         {id:'done',label:'Done',icon:'✓'},
         {id:'no',label:'Issue found',icon:'⚠'},
         {id:'na',label:'Not applicable',icon:'⊖'},
       ].map(choice=><button type="button" key={choice.id} aria-pressed={selected===choice.id}
         className={'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-sm font-semibold '+(selected===choice.id?'border-violet-700 bg-violet-700 text-white':'border-slate-300 bg-white hover:border-violet-400 dark:border-slate-600 dark:bg-slate-800')}
         onClick={()=>{const next=choice.id==='done'?(type==='none'?true:'yes'):choice.id;const flagged=choice.id==='no';if(flagged)setNoteOpen(true);if(onPick)onPick(next,flagged);else{change(next);setIssue(flagged);}}}>
         <span className="text-xl leading-none" aria-hidden="true">{choice.icon}</span>{choice.label}
       </button>)}
     </div>
     <button type="button" className="min-h-10 text-sm font-semibold text-violet-700 dark:text-violet-300" aria-expanded={noteOpen||!!remarks} onClick={()=>setNoteOpen(v=>!v)}>{remarks?'Note':noteOpen?'Hide note':'+ Add a note'}</button>
     {(noteOpen||!!remarks)&&<textarea className={inputClass} aria-label={'Note: '+snapshot.title} value={remarks} maxLength={2000} placeholder="Add details (optional)" onChange={e=>setRemarks(e.target.value)}/>}
   </div>;
 }
 return <>{snapshot.allow_na&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={na} onChange={e=>change(e.target.checked?'na':null)}/>Not Applicable</label>}{!na&&<>{(type==='none'||type==='photo')&&<label className="flex min-h-11 items-center gap-3"><input aria-label={`Confirm ${snapshot.title}`} type="checkbox" className="h-5 w-5 accent-violet-600" checked={value===true} onChange={e=>change(e.target.checked)}/>{type==='photo'?'Photo documents the completed work':'I completed this item'}</label>}{type==='yes_no'&&maintenance&&<div role="group" aria-label={`Result: ${snapshot.title}`} className="flex flex-wrap gap-2">{[['yes','Pass'],['no','Issue'],...(snapshot.allow_na?[['na','N/A']]:[])].map(([v,label])=><button key={v} type="button" aria-pressed={value===v} className={`${buttonClass} ${value===v?(v==='no'?'border-red-300 bg-red-50 text-red-800':'border-violet-400 bg-violet-100 text-violet-900'):''}`} onClick={()=>{change(v);setIssue(v==='no');}}>{label}</button>)}</div>}{type==='yes_no'&&!maintenance&&<Field label="Answer"><select aria-label={`Answer: ${snapshot.title}`} className={inputClass} value={typeof value==='string'?value:''} onChange={e=>change(e.target.value||null)}><option value="">Choose answer</option><option value="yes">Yes — passed</option><option value="no">No — issue found</option></select></Field>}{type==='numeric'&&<><Field label={`Reading: ${snapshot.title}${snapshot.unit?' ('+snapshot.unit+')':''}`}>{degrees.length>0&&<select aria-label="Choose observed temperature" className={inputClass} value={customReading?'other':typeof value==='number'?String(value):''} onChange={e=>{const v=e.target.value;setManualReading(v==='other');change(v==='other'||v===''?null:Number(v));}}><option value="">Select thermometer reading</option>{degrees.map(n=><option key={n} value={n}>{n} °C</option>)}<option value="other">Other reading / decimal</option></select>}{(!degrees.length||customReading)&&<input type="number" step="any" className={inputClass} value={typeof value==='number'?value:''} onChange={e=>change(e.target.value===''?null:Number(e.target.value))}/>}</Field>{(snapshot.min!=null||snapshot.max!=null)&&<p className="text-xs text-slate-500">Expected range: {snapshot.min??'No minimum'} to {snapshot.max??'No maximum'} {snapshot.unit}</p>}</>}{type==='text'&&<Field label={`Response: ${snapshot.title}`}><textarea className={inputClass} maxLength={4000} value={typeof value==='string'?value:''} onChange={e=>change(e.target.value.trim()?e.target.value:null)}/></Field>}</>}
   <Field label="Remarks"><textarea aria-label={`Remarks: ${snapshot.title}`} className={inputClass} maxLength={2000} value={remarks} onChange={e=>{setRemarks(e.target.value);}} placeholder={na?'Explain why this item does not apply':value==='no'?'Describe the issue':'Optional notes'}/></Field><label className="flex gap-2 text-sm"><input type="checkbox" checked={issue} onChange={e=>{setIssue(e.target.checked);}}/>Flag an issue</label></>;
}

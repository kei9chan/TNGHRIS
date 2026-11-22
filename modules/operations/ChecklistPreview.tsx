import React,{useState} from 'react';
import Modal from '../../components/ui/Modal';
import ChecklistResponseFields from './ChecklistResponseFields';
import type {OpsItem, OpsRunItem, OpsVersion} from './types';

function ExampleItem({item,onAnswered}:{item:OpsItem;onAnswered:(answered:boolean)=>void}){
  const [value,change]=useState<OpsRunItem['response']['value']>(null);
  const [remarks,setRemarks]=useState('');
  const [issue,setIssue]=useState(false);
  return <section className="space-y-3 rounded-2xl border p-4">
    <div className="flex justify-between gap-2"><h4 className="font-semibold">{item.ordinal+1}. {item.snapshot.title}</h4><span className="text-xs">{item.required?'Required':'Optional'}</span></div>
    <p className="whitespace-pre-wrap text-sm">{item.snapshot.instructions||item.snapshot.description}</p>
    <ChecklistResponseFields snapshot={item.snapshot} type={item.response_type} value={value} checklist change={v=>{change(v);onAnswered(v!==null);}} remarks={remarks} setRemarks={setRemarks} issue={issue} setIssue={setIssue}/>
    <details open={item.response_type==='photo'||!!item.snapshot.photo_required||undefined}><summary>Photos · {item.response_type==='photo'||item.snapshot.photo_required?'required':'optional'}</summary><input type="file" accept="image/*" aria-label="Preview photo field" disabled/></details>
  </section>;
}

export default function ChecklistPreview({version,onClose}:{version:OpsVersion;onClose:()=>void}){
  const [answers,setAnswers]=useState<Record<string,boolean>>({});
  const answered=Object.values(answers).filter(Boolean).length;
  return <Modal isOpen onClose={onClose} title={version.content.title} size="3xl" viewportFit><div className="space-y-4">
    <p role="note" className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">Staff preview · Version {version.version}. Try the fields here. Example answers disappear when you close the preview.</p>
    <p className="whitespace-pre-wrap">{version.content.instructions||version.content.description}</p>
    <p className="text-sm font-semibold">{answered} of {version.items.length} answered · {Math.round(answered*100/(version.items.length||1))}%</p><progress className="w-full accent-violet-700" aria-label="Preview progress" value={answered} max={version.items.length||1}/>
    {version.items.map(item=><ExampleItem key={item.id} item={item} onAnswered={v=>setAnswers(old=>({...old,[item.id]:v}))}/>)}
  </div></Modal>;
}

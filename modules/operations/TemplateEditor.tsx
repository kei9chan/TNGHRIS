import React, { useState } from 'react';
import EvidenceRules from './EvidenceRules';
import Modal from '../../components/ui/Modal';
import { operationsRpc } from './service';
import type { OpsContent, OpsKind, OpsTemplate, OpsWorkspace, OpsResponse, OpsPriority } from './types';
import { buttonClass, primaryClass, inputClass, Field } from './ui';

interface Props { workspace: OpsWorkspace; unit: string; kind: OpsKind; template?: OpsTemplate; onClose: () => void; onSaved: () => Promise<void> }
export default function TemplateEditor({workspace,unit,kind,template,onClose,onSaved}: Props) {
  const [content,setContent] = useState<OpsContent>(template ? structuredClone(template.draft) : {title:'',description:'',instructions:'',category:kind==='checklist'?'Opening':'Operations',priority:'Normal',evidence:'none',frequency:'As needed',duration:5,items:[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[taskId,setTaskId]=useState(''),[custom,setCustom]=useState('');
  const set = <K extends keyof OpsContent>(key: K, value: OpsContent[K]) => setContent(c=>({...c,[key]:value}));
  const tasks=workspace.templates.filter(t=>t.kind==='task'&&t.status==='Published');
  const items=content.items||[];
  const taskTitle=(version?: string)=>tasks.flatMap(t=>t.versions).find(v=>v.id===version)?.content.title||'Published task';
  function move(index:number,direction:number) {const next=[...items];[next[index],next[index+direction]]=[next[index+direction],next[index]];set('items',next);}
  async function save(publish: boolean) {
    setBusy(true);setError('');
    try {await operationsRpc('ops_save_template',{p_id:template?.id||null,p_unit:unit||null,p_kind:kind,p_content:content,p_revision:template?.revision||null,p_publish:publish});await onSaved();onClose();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Modal isOpen onClose={onClose} size="4xl" viewportFit title={`${template?'Edit':'Create'} ${kind}${!unit?' · TNG Master':''}`}>
    <form onSubmit={e=>{e.preventDefault();void save(false);}} className="space-y-5">
      <p className="text-sm text-slate-500">Saving a draft preserves the current published version. Publishing creates a new immutable version; existing assignments keep their original instructions.</p>
      <Field label="Title"><input className={inputClass} required minLength={3} maxLength={180} value={content.title} onChange={e=>set('title',e.target.value)}/></Field>
      <Field label="Description"><textarea className={inputClass} value={content.description||''} onChange={e=>set('description',e.target.value)}/></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department"><select className={inputClass} value={content.department_id||''} onChange={e=>set('department_id',e.target.value)}><option value="">All departments</option>{workspace.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Category">{kind==='checklist'?<select className={inputClass} value={content.category} onChange={e=>set('category',e.target.value)}>{['Opening','Closing','Cleaning','Maintenance','Inspection','Inventory','Handover','Other'].map(x=><option key={x}>{x}</option>)}</select>:<input className={inputClass} value={content.category||''} onChange={e=>set('category',e.target.value)}/>}</Field>
      </div>
      {kind==='task'?<>
        <Field label="Instructions / SOP"><textarea rows={4} className={inputClass} value={content.instructions||''} onChange={e=>set('instructions',e.target.value)}/></Field>
        <Field label="SOP / manual URL"><input type="url" className={inputClass} value={content.sop_url||''} onChange={e=>set('sop_url',e.target.value)} placeholder="https://…"/></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority"><select className={inputClass} value={content.priority} onChange={e=>set('priority',e.target.value as OpsPriority)}>{['Low','Normal','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Suggested frequency"><input className={inputClass} value={content.frequency||''} onChange={e=>set('frequency',e.target.value)} placeholder="Daily, weekly, every 3 months…"/></Field>
          <Field label="Estimated duration (minutes)"><input type="number" min={0} className={inputClass} value={content.duration??0} onChange={e=>set('duration',Number(e.target.value))}/></Field>
          <Field label="Assigned role / position"><input className={inputClass} value={content.position||''} onChange={e=>set('position',e.target.value)}/></Field>
          <Field label="Linked existing asset"><select className={inputClass} value={content.asset_id||''} onChange={e=>set('asset_id',e.target.value)}><option value="">No linked asset</option>{workspace.assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Response type / evidence requirement"><select className={inputClass} value={content.evidence} onChange={e=>set('evidence',e.target.value as OpsResponse)}>{['none','yes_no','text','photo','numeric'].map(x=><option key={x}>{x}</option>)}</select></Field>
        </div>
        <EvidenceRules rules={content} numeric={content.evidence==='numeric'} onChange={patch=>setContent(c=>({...c,...patch}))}/>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={!!content.safety_critical} onChange={e=>set('safety_critical',e.target.checked)}/>Safety-critical task</label>
      </>:<>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch / location"><input className={inputClass} value={content.location||''} onChange={e=>set('location',e.target.value)}/></Field>
          <Field label="Applicable positions"><input className={inputClass} value={content.positions||''} onChange={e=>set('positions',e.target.value)} placeholder="Bartender, Shift Supervisor…"/></Field>
          <Field label="Responsible manager"><select className={inputClass} value={content.responsible_manager_id||''} onChange={e=>set('responsible_manager_id',e.target.value)}><option value="">Not specified</option>{workspace.people.filter(p=>p.bum).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        <div className="rounded-2xl border border-violet-100 p-4 dark:border-slate-700">
          <h3 className="mb-3 font-semibold">Checklist tasks · {items.length}</h3>
          <div className="flex flex-wrap gap-2"><select aria-label="Task from library" className={`${inputClass} flex-1`} value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">Choose a published library task</option>{tasks.map(t=><option key={t.id} value={t.versions[0]?.id}>{t.versions[0]?.content.title}{!t.business_unit_id?' · Master':''}</option>)}</select><button type="button" className={buttonClass} disabled={!taskId} onClick={()=>{const v=tasks.flatMap(t=>t.versions).find(v=>v.id===taskId);set('items',[...items,{task_version_id:taskId,required:true,response_type:v?.content.evidence||'none'}]);setTaskId('');}}>Add task</button></div>
          <div className="mt-3 flex gap-2"><input aria-label="Custom checklist task title" className={inputClass} placeholder="Custom task title" value={custom} onChange={e=>setCustom(e.target.value)}/><button type="button" className={buttonClass} disabled={custom.trim().length<3} onClick={()=>{set('items',[...items,{snapshot:{title:custom,instructions:'',evidence:'none',priority:'Normal'},required:true,response_type:'none'}]);setCustom('');}}>Add custom</button></div>
          <div className="mt-4 space-y-3">{items.map((item,i)=><section key={i} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>{i+1}. {item.snapshot?.title||taskTitle(item.task_version_id)}</strong><div className="flex gap-1"><button type="button" className={buttonClass} aria-label={`Move task ${i+1} up`} disabled={i===0} onClick={()=>move(i,-1)}>↑</button><button type="button" className={buttonClass} aria-label={`Move task ${i+1} down`} disabled={i===items.length-1} onClick={()=>move(i,1)}>↓</button><button type="button" className={buttonClass} onClick={()=>set('items',items.filter((_,index)=>i!==index))}>Remove</button></div></div>
            {item.snapshot&&<div className="mt-3 grid gap-3"><Field label="Custom instructions"><textarea className={inputClass} value={item.snapshot.instructions||''} onChange={e=>set('items',items.map((x,j)=>j===i?{...x,snapshot:{...x.snapshot!,instructions:e.target.value}}:x))}/></Field><Field label="Custom SOP URL"><input type="url" className={inputClass} value={item.snapshot.sop_url||''} onChange={e=>set('items',items.map((x,j)=>j===i?{...x,snapshot:{...x.snapshot!,sop_url:e.target.value}}:x))}/></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!item.snapshot.safety_critical} onChange={e=>set('items',items.map((x,j)=>j===i?{...x,snapshot:{...x.snapshot!,safety_critical:e.target.checked}}:x))}/>Safety-critical</label></div>}
            <div className="mt-3 flex flex-wrap items-center gap-4"><label className="flex gap-2 text-sm"><input type="checkbox" checked={item.required} onChange={e=>set('items',items.map((x,j)=>j===i?{...x,required:e.target.checked}:x))}/>Required</label><select aria-label={`Response type for task ${i+1}`} className={`${inputClass} w-auto`} value={item.response_type} onChange={e=>set('items',items.map((x,j)=>j===i?{...x,response_type:e.target.value as OpsResponse}:x))}>{['none','yes_no','text','photo','numeric'].map(x=><option key={x}>{x}</option>)}</select></div>
            <EvidenceRules prefix={`Task ${i+1}`} rules={item.rules||item.snapshot||tasks.flatMap(t=>t.versions).find(v=>v.id===item.task_version_id)?.content||{}} numeric={item.response_type==='numeric'} onChange={patch=>set('items',items.map((x,j)=>j===i?{...x,rules:{...(x.rules||x.snapshot||tasks.flatMap(t=>t.versions).find(v=>v.id===x.task_version_id)?.content||{}),...patch}}:x))}/>
          </section>)}</div>
        </div>
      </>}
      {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className={buttonClass} onClick={onClose}>Cancel</button><button className={buttonClass} disabled={busy}>Save draft</button><button type="button" className={primaryClass} disabled={busy||content.title.trim().length<3||(kind==='checklist'&&!items.length)} onClick={()=>void save(true)}>{busy?'Saving…':`Publish${template?` version ${template.latest_version+1}`:''}`}</button></div>
    </form>
  </Modal>;
}

import React,{useEffect,useState} from 'react';
import {Award,BusinessUnit,User} from '../../types';
import {fetchLetterTemplates,LetterTemplate} from '../../services/commendationService';
import {supabase} from '../../services/supabaseClient';
import CommendationLetter from './CommendationLetter';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
export default function CommendationTemplates({units,awards,users}:{units:BusinessUnit[];awards:Award[];users:User[]}) {
 const [templates,setTemplates]=useState<LetterTemplate[]>([]),[editing,setEditing]=useState<LetterTemplate>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[signer,setSigner]=useState('');
 const load=()=>fetchLetterTemplates().then(setTemplates).catch(e=>setError(e.message));useEffect(()=>{void load();},[]);
 const change=(key:string,value:string)=>setEditing(t=>t&&({...t,config:{...t.config,[key]:value}}));
 const image=async(file:File|undefined,signature=false)=>{if(!file||!editing)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>200000){setError('Use a PNG/JPEG image smaller than 200 KB.');return;}const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});setEditing(t=>t&&({...t,config:{...t.config,...(signature?{signatures:[...(t.config.signatures||[]).filter(s=>s.userId!==signer),{userId:signer,image:data}]}:{logo:data})}}));};
 return <section className="space-y-4 rounded-xl border bg-white p-5 text-gray-900"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Letter of Commendation templates</h2><p className="text-sm text-gray-500">Approved branding · edits create a new version · issued letters stay unchanged</p></div><Button onClick={()=>{setEditing({id:'',name:'New Letter of Commendation',business_unit_id:null,award_type_id:null,version:1,active:false,config:{wordmark:'TNG HRIS',accent:'#4f46e5',textColor:'#172033',opening:'We are pleased to recognize your contribution.',closing:'Thank you for your dedication.',signatures:[]}});setError('');}}>New template</Button></div>
  {error&&<p role="alert" className="text-red-600">{error}</p>}
  <div className="grid gap-3 md:grid-cols-3">{templates.map(t=><button key={t.id} onClick={()=>{setEditing(structuredClone(t));setError('');}} className="rounded border p-4 text-left"><b>{t.name}</b><p className="text-sm">{t.active?'Active / approved':'Inactive'} · v{t.version}</p><span className="text-sm text-indigo-600">Preview / Edit branding & signatories</span></button>)}</div>
  {editing&&<Modal isOpen title="Commendation template" size="4xl" onClose={()=>{if(!busy)setEditing(undefined);}} footer={<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const values={name:editing.name,business_unit_id:editing.business_unit_id,award_type_id:editing.award_type_id,active:editing.active,config:editing.config};const result=editing.id?await supabase.from('commendation_templates').update(values).eq('id',editing.id):await supabase.from('commendation_templates').insert(values);if(result.error)throw result.error;await load();setEditing(undefined);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Save template version</Button>}>
   {error&&<p role="alert" className="text-red-600">{error}</p>}
   <div className="grid gap-4 sm:grid-cols-2">
    <label>Name<input className="block w-full rounded border p-2" value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
    <label>Business unit<select className="block w-full rounded border p-2" value={editing.business_unit_id||''} onChange={e=>setEditing({...editing,business_unit_id:e.target.value||null})}><option value="">Corporate fallback</option>{units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    <label>Award type<select className="block w-full rounded border p-2" value={editing.award_type_id||''} onChange={e=>setEditing({...editing,award_type_id:e.target.value||null})}><option value="">All award types</option>{awards.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Active / approved for use</label>
    <label>Brand wordmark<input className="block w-full rounded border p-2" value={editing.config.wordmark} onChange={e=>change('wordmark',e.target.value)}/></label>
    <label>Logo (PNG/JPEG)<input type="file" accept="image/png,image/jpeg" onChange={e=>void image(e.target.files?.[0])}/><button onClick={()=>change('logo','')} className="block text-sm underline">Use wordmark instead</button></label>
    <label>Brand side panel<input type="color" value={editing.config.accent} onChange={e=>change('accent',e.target.value)}/></label>
    <label>Text color<input type="color" value={editing.config.textColor} onChange={e=>change('textColor',e.target.value)}/></label>
    <label>Opening wording<textarea className="block w-full rounded border p-2" value={editing.config.opening} onChange={e=>change('opening',e.target.value)}/></label>
    <label>Closing wording<textarea className="block w-full rounded border p-2" value={editing.config.closing} onChange={e=>change('closing',e.target.value)}/></label>
    <label>Authorized signatory<select className="block w-full rounded border p-2" value={signer} onChange={e=>setSigner(e.target.value)}><option value="">Select a signatory</option>{users.filter(u=>u.status==='Active').map(u=><option key={u.id} value={u.id}>{u.name} — {u.position}</option>)}</select></label>
    <label>Authorized signature image<input disabled={!signer} type="file" accept="image/png,image/jpeg" onChange={e=>void image(e.target.files?.[0],true)}/></label>
   </div><p className="my-3 text-sm">A configured signature is included only when that person is the issuer or an actual approving signatory.</p>
   {(editing.config.signatures||[]).map(s=><p key={s.userId} className="text-sm">{users.find(u=>u.id===s.userId)?.name||s.userId} <button className="text-red-600 underline" onClick={()=>setEditing({...editing,config:{...editing.config,signatures:editing.config.signatures?.filter(x=>x.userId!==s.userId)}})}>Remove signature</button></p>)}
   <CommendationLetter data={{employeeId:'sample',employeeName:'Sample Employee',awardTitle:awards.find(a=>a.id===editing.award_type_id)?.title||'Service Excellence',awardDate:new Date().toISOString().slice(0,10),citation:'Your thoughtful service and commitment to quality made a lasting difference to our guests and team.',businessUnit:units.find(u=>u.id===editing.business_unit_id)?.name||'TNG HRIS',issuer:{id:signer,name:users.find(u=>u.id===signer)?.name||'Sample Issuer',position:users.find(u=>u.id===signer)?.position||'Authorized issuer'},approvers:[{id:'sample-approver',name:'Sample Approver',position:'Authorized approver'}],brand:editing.config,templateVersion:editing.version}}/>
  </Modal>}
 </section>;
}

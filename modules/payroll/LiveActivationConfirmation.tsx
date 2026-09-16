import React,{useState} from 'react';
import Button from '../../components/ui/Button';
export type LiveAuthorization={id:string;scope:string;from:string;to:string;scopeName:string;reference:string;authorized:boolean};
const LiveActivationConfirmation:React.FC<{id:string;scope:string;from:string;to:string;scopeName:string;resume:boolean;busy:boolean;onAuthorize:(input:LiveAuthorization)=>Promise<void>}>=({id,scope,from,to,scopeName,resume,busy,onAuthorize})=>{
 const [open,setOpen]=useState(false),[typed,setTyped]=useState(''),[reference,setReference]=useState(''),[authorized,setAuthorized]=useState(false);
 if(!open)return <Button type="button" variant="secondary" disabled={busy} onClick={()=>setOpen(true)}>Review {resume?'resumption':'live activation'} for {scopeName}</Button>;
 return <form className="mt-4 space-y-3 rounded border-2 border-amber-500 p-4" onSubmit={e=>{e.preventDefault();if(busy||typed!==scopeName||!authorized||reference.trim().length<3)return;void onAuthorize({id,scope,from,to,scopeName,reference:reference.trim(),authorized}).finally(()=>{setAuthorized(false);setTyped('');setReference('');setOpen(false);});}}>
 <h3 className="font-bold">Explicit authorization to {resume?'resume':'enable'} live payroll</h3><p><strong>{scopeName}</strong> · certified first live cutoff <strong>{from}–{to}</strong></p><p>This changes this business unit’s processing mode to LIVE. Existing payroll approvals and payment-release controls still apply. Test approvals alone do not authorize this change.</p>
 <label className="block">Type the exact business unit name<input className="mt-1 block w-full rounded border p-2 dark:bg-slate-800" required value={typed} disabled={busy} onChange={e=>setTyped(e.target.value)}/></label>
 <label className="block">Live authorization / handover reference<textarea className="mt-1 block w-full rounded border p-2 dark:bg-slate-800" required minLength={3} maxLength={1000} value={reference} disabled={busy} onChange={e=>setReference(e.target.value)}/></label>
 <label className="flex gap-2"><input type="checkbox" required checked={authorized} disabled={busy} onChange={e=>setAuthorized(e.target.checked)}/><span>I explicitly authorize {scopeName} to {resume?'resume':'enable'} live payroll under this handover certificate.</span></label>
 <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy||typed!==scopeName||!authorized||reference.trim().length<3}>Authorize {resume?'resumption':'live activation'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setOpen(false);setAuthorized(false);setTyped('');setReference('');}}>Cancel — keep current mode</Button></div>
 </form>;
}

export default LiveActivationConfirmation;

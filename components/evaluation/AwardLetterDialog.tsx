import React,{useEffect,useState} from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {supabase} from '../../services/supabaseClient';
import {AwardLetter,downloadLetter,letterAction} from '../../services/commendationService';
import {useAuth} from '../../hooks/useAuth';
export default function AwardLetterDialog({id,onClose}:{id:string;onClose:()=>void}) {
 const {user}=useAuth();const [letter,setLetter]=useState<AwardLetter>();const [url,setUrl]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [opened,setOpened]=useState(false);
 useEffect(()=>{let active=true;let objectUrl='';(async()=>{try{const {data,error}=await supabase.from('award_letters').select('*').eq('award_id',id).single();if(error)throw error;const record=data as AwardLetter;const blob=await downloadLetter(record);objectUrl=URL.createObjectURL(blob);if(active){setLetter(record);setUrl(objectUrl);}else URL.revokeObjectURL(objectUrl);}catch(e){if(active)setError((e as Error).message||'You do not have access to this private letter.');}})();return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[id]);
 const own=letter?.snapshot.employeeId===user?.id;
 return <Modal isOpen title="Letter of Commendation" size="4xl" onClose={onClose} footer={<div className="flex flex-wrap gap-3">
  {url&&<a href={url} download={`Commendation-${id}.pdf`} className="rounded border px-4 py-2">Download Letter</a>}
  {own&&<Button disabled={!opened||busy||!!letter?.acknowledged_at} onClick={async()=>{setBusy(true);try{setLetter(await letterAction(id,'acknowledge'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{letter?.acknowledged_at?'Receipt acknowledged':'Acknowledge Receipt'}</Button>}
  <Button variant="secondary" onClick={onClose}>Close</Button>
 </div>}>
  {error&&<p role="alert" className="text-red-600">{error}</p>}
  {url?<><iframe title="Personalized commendation PDF" src={url} className="h-[65vh] w-full" onLoad={async()=>{try{await letterAction(id,'open');setOpened(true);}catch(e){setError((e as Error).message);}}}/><p className="mt-2 text-sm">{letter?.acknowledged_at?`Acknowledged ${new Date(letter.acknowledged_at).toLocaleString()}`:'Open and read the letter before acknowledging receipt.'}</p><a href={url} target="_blank" rel="noreferrer" onClick={async()=>{try{await letterAction(id,'open');setOpened(true);}catch(e){setError((e as Error).message);}}} className="underline">Open Letter in a new tab</a></>:!error&&<p>Loading private letter…</p>}
 </Modal>;
}

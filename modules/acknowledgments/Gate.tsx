import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ackRpc, GATE_MESSAGE } from './service';
export function GateMessage() {
 return <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-5 text-slate-900 space-y-3"><h2 className="font-bold text-lg">Action Required: Pending Acknowledgment</h2><p>{GATE_MESSAGE}</p><div className="flex flex-wrap gap-4"><a className="font-semibold underline" href="/acknowledgments" target="_blank" rel="noopener noreferrer">Review Pending Documents</a><a className="underline" href="/dashboard" target="_blank" rel="noopener noreferrer">Return to Dashboard</a></div><p className="text-sm">These links open in another tab so your draft stays here. Access refreshes when you return.</p></div>;
}
export function useAcknowledgmentGate(requestType?: string, active = true) {
 const { user } = useAuth();
 const [state,setState] = useState({ blocked: false, loading: !!requestType && active, error: '' });
 useEffect(() => {
  if (!requestType || !active || !user) { setState({blocked:false,loading:false,error:''}); return; }
  let live = true;
  const check = async () => { if (live) setState(s=>({...s,loading:true})); try { const g=await ackRpc('acknowledgment_gate',{p_request_type:requestType}); if(live)setState({blocked:g.blocked,loading:false,error:''}); } catch(e) { if(live)setState({blocked:false,loading:false,error:(e as Error).message}); } };
  void check(); window.addEventListener('focus',check); window.addEventListener('acknowledgment-changed',check);
  return ()=> {live=false;window.removeEventListener('focus',check);window.removeEventListener('acknowledgment-changed',check);};
 },[user?.id,requestType,active]);
 return state;
}
// Covers server rejections, including documents assigned after a form was opened.
export function GateRejectionNotice() {
 const [shown,setShown]=useState(false);
 useEffect(()=>{const show=()=>setShown(true);window.addEventListener('acknowledgment-required',show);return()=>window.removeEventListener('acknowledgment-required',show);},[]);
 if(!shown)return null;
 return <div className="fixed inset-0 z-[11000] overflow-auto bg-black/50 p-6"><div className="mx-auto mt-16 max-w-xl bg-white p-4 rounded-xl"><GateMessage/><button className="mt-4 underline" onClick={()=>setShown(false)}>Return to draft</button></div></div>;
}

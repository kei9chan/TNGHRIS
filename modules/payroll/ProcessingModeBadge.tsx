import React,{useEffect,useState} from 'react';
import {grossContext} from './grossPay';
import {modeLabel,readSelection} from './workspace';
import {useAuth} from '../../hooks/useAuth';
export default function ProcessingModeBadge({scopeId,mode,scopeName}:{scopeId?:string;mode?:string;scopeName?:string}){
 const {user}=useAuth();const [text,setText]=useState('Checking processing mode…');
 useEffect(()=>{if(mode!==undefined){setText(`${scopeName||'Selected scope'} · ${modeLabel(mode)}`);return;}let active=true;setText('Checking processing mode…');const scope=scopeId||(()=>{try{return readSelection(localStorage,user?.id||'').scope;}catch{return '';}})();
 grossContext().then(c=>{if(active){const s=c.scopes.find(s=>s.id===scope);setText(s?`${s.name} · ${modeLabel(s.mode)}`:'Select a BU in Payroll Home to view processing mode.');}}).catch(()=>{if(active)setText('Processing mode unavailable.');});return()=>{active=false;};
 },[scopeId,user?.id,mode,scopeName]);return <span className="rounded-full bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900" role="status">{text}</span>;
}

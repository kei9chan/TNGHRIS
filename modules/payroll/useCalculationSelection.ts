import {useCallback,useSyncExternalStore} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {calculationKey,parseCalculationSelection} from './calculationModel';
import type {CalculationSelection} from './calculationModel';
const event='payroll-calculation-selection';
const subscribe=(callback:()=>void)=>{window.addEventListener(event,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(event,callback);window.removeEventListener('storage',callback);};};
export function useCalculationSelection(scope:string,from:string,to:string){
 const {user}=useAuth();const key=calculationKey(user?.id||'',scope,from,to);
 const read=useCallback(()=>{try{return localStorage.getItem(key)||'';}catch{return '';}},[key]);
 const raw=useSyncExternalStore(subscribe,read,()=> '');
 const update=useCallback((next:CalculationSelection)=>{try{const value=JSON.stringify(next);if(localStorage.getItem(key)!==value){localStorage.setItem(key,value);window.dispatchEvent(new Event(event));}}catch{/* Selection is optional; server records remain the source of truth. */}},[key]);
 return [parseCalculationSelection(raw),update] as const;
}

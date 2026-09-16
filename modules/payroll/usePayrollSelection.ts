import {useCallback,useSyncExternalStore} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {Selection,readSelection,workspaceKey} from './workspace';
const event='payroll-workspace-selection';
const subscribe=(callback:()=>void)=>{window.addEventListener(event,callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener(event,callback);window.removeEventListener('storage',callback);};};
export function usePayrollField(field:keyof Selection){
 const {user}=useAuth();const id=user?.id||'';
 const read=useCallback(()=>{try{return readSelection(localStorage,id)[field];}catch{return '';}},[id,field]);
 const value=useSyncExternalStore(subscribe,read,()=> '');
 const update=useCallback((next:string)=>{try{localStorage.setItem(workspaceKey(id),JSON.stringify({...readSelection(localStorage,id),[field]:next}));window.dispatchEvent(new Event(event));}catch{}},[field,id]);
 return [value,update] as const;
}

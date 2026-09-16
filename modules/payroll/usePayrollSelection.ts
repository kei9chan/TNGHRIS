import {useState,useCallback} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {Selection,readSelection,workspaceKey} from './workspace';
function read(id:string,field:keyof Selection){try{return readSelection(localStorage,id)[field];}catch{return '';}}
export function usePayrollField(field:keyof Selection){
 const {user}=useAuth();const id=user?.id||'';
 const [state,setState]=useState(()=>({id,field,value:read(id,field)}));
 const value=state.id===id&&state.field===field?state.value:read(id,field);
 if(state.id!==id||state.field!==field)setState({id,field,value});
 const update=useCallback((next:string)=>{setState({id,field,value:next});try{localStorage.setItem(workspaceKey(id),JSON.stringify({...readSelection(localStorage,id),[field]:next}));}catch{}},[field,id]);
 return [value,update] as const;
}

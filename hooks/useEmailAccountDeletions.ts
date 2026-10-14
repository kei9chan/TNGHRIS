import {useCallback,useEffect,useRef,useState} from 'react';
import {emptyDeletionWorkspace,fetchEmailAccountDeletionWorkspace} from '../services/emailAccountDeletionService';

export function useEmailAccountDeletions(viewerId?:string) {
  const [workspace,setWorkspace]=useState(emptyDeletionWorkspace),[error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++generation.current;setLoading(true);setError('');
    try {const data=viewerId?await fetchEmailAccountDeletionWorkspace():emptyDeletionWorkspace;if(request===generation.current)setWorkspace(data);}
    catch(e){if(request===generation.current)setError((e as Error).message);}
    finally{if(request===generation.current)setLoading(false);}
  },[viewerId]);
  useEffect(()=>{
    setWorkspace(emptyDeletionWorkspace);void refresh();
    const onFocus=()=>{void refresh();};window.addEventListener('focus',onFocus);
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
    return()=>{++generation.current;window.clearInterval(timer);window.removeEventListener('focus',onFocus);};
  },[refresh]);
  return {workspace,error,loading,refresh};
}

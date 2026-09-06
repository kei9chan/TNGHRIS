import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {listApprovals} from './approvals';
export default function PayrollApprovalNotice(){const {user}=useAuth();const [count,setCount]=useState(0);
 useEffect(()=>{let active=true;const refresh=()=>{void listApprovals().then(items=>{if(active)setCount(items.filter(x=>x.canAct).length);}).catch(()=>{if(active)setCount(0);});};setCount(0);refresh();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);};},[user?.id]);
 return count>0?<Link to="/payroll/approvals" className="mb-4 block rounded border border-indigo-300 bg-indigo-50 p-4 text-indigo-800">{count} payroll {count===1?'version needs':'versions need'} your approval. Open Payroll Approvals.</Link>:null;
}

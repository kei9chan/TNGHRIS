import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import {deadlineLabel,workflowRpc} from './workflow';
export default function NTEDeadlineQueue(){const{user}=useAuth();const[rows,setRows]=useState<any[]>([]),[error,setError]=useState('');useEffect(()=>{let live=true;setRows([]);if(user)workflowRpc('get_my_nte_deadline_queue').then(v=>{if(live)setRows(v);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[user?.id]);if(!rows.length&&!error)return null;return <Card title="Administrative Cases — response deadlines and decisions" className="mb-4">{error?<p role="alert">Could not load case deadlines: {error}</p>:<ul className="max-h-80 space-y-3 overflow-y-auto">{rows.map(r=><li key={r.id} className="border-b pb-3"><Link className="font-semibold text-violet-600 dark:text-violet-300" to={`/feedback/nte/${r.id}`}>{r.nte_number||'NTE'} · {r.employee}</Link><p>{r.stage}{r.no_response?' — No Response':''}</p>{r.deadline_exclusive&&!r.closed_at&&<p>Due {deadlineLabel(r.deadline_exclusive)}</p>}</li>)}</ul>}</Card>;}

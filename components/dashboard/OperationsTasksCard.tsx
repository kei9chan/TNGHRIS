import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {operationsRpc} from '../../modules/operations/service';
import {formatDue, manilaDay} from '../../modules/operations/presentation';

type Task = {id:string; due_at:string|null; status:string; title:string; unit:string; kind:string};

export default function OperationsTasksCard({userId}:{userId:string}) {
  const [tasks,setTasks]=useState<Task[]>([]);
  const [failed,setFailed]=useState(false);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    let active=true, request=0;
    async function refresh(){
      if(document.visibilityState==='hidden') return;
      const current=++request;
      try {
        const rows=await operationsRpc<Task[]>('ops_my_dashboard_tasks',{});
        if(active&&current===request){setTasks(rows);setFailed(false);}
      } catch { if(active&&current===request)setFailed(true); }
    }
    void refresh();
    const timer=window.setInterval(refresh,60000);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[userId]);
  if(!tasks.length&&!failed)return null;
  const now=new Date();
  return <section aria-label="My operations tasks" className="my-4 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <h2 className="font-semibold">My operations tasks {tasks.length>0&&<span>({tasks.length})</span>}</h2>
    {failed&&<p role="status" className="my-2 text-sm">Couldn’t refresh assignments. <Link className="underline" to="/operations?view=Tasks">Open Operations Station</Link></p>}
    <ul className="divide-y">{(expanded?tasks:tasks.slice(0,4)).map(task=>{
      const overdue=task.due_at&&new Date(task.due_at)<now;
      const today=task.due_at&&manilaDay(task.due_at)===manilaDay(now);
      const label=overdue?'Overdue':today?'Due today':'Upcoming';
      return <li key={task.id}><Link className="flex items-center justify-between gap-4 py-3" to={'/operations?view=Tasks&assignment='+encodeURIComponent(task.id)}>
        <span><strong className="block">{task.title}</strong><span className="text-sm">{task.unit}{task.due_at&&' · '+formatDue(task.due_at)}</span></span>
        <span className={'text-right text-sm font-semibold '+(overdue?'text-red-700 dark:text-red-300':'text-violet-700 dark:text-violet-300')}>{task.due_at?label:task.status} ›</span>
      </Link></li>;
    })}</ul>
    {tasks.length>4&&<button className="mt-2 text-sm font-semibold underline" onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer':'Show all '+tasks.length+' tasks'}</button>}
  </section>;
}

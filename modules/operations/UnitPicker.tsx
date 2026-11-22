import React from 'react';
type Props={units:{id:string;name:string}[];value:string;onChange:(id:string)=>void};
export default function UnitPicker({units,value,onChange}:Props){
  return <fieldset className="min-w-0 flex-1">
    <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Business unit</legend>
    <div className="flex flex-wrap gap-2">{[{id:'',name:'All workspaces'},...units].map(u=>{
      const selected=u.id===value;
      return <button key={u.id} type="button" aria-pressed={selected} onClick={()=>onChange(u.id)}
        className={'min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-violet-500 '+(selected?'border-violet-700 bg-violet-700 text-white':'border-slate-200 bg-white hover:border-violet-400 dark:border-slate-600 dark:bg-slate-800')}>
        {selected&&<span aria-hidden="true">✓ </span>}{u.name}
      </button>;
    })}</div>
  </fieldset>;
}

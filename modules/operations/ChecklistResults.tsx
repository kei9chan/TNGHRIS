import UnitPicker from './UnitPicker';
import React, {useEffect, useState} from 'react';
import {operationsRpc} from './service';
import {manilaDay, formatDue} from './presentation';
import {inputClass, Field} from './ui';

type Item = {title:string; value:string|number|boolean|null; remarks?:string; issue?:boolean};
type Results = {
  units:{id:string; name:string}[];
  results:{id:string; unit:string; title:string; submitted_at:string; submitted_by:string|null; outcome:string; items:Item[]|null}[];
};

export default function ChecklistResults(){
  const [date,setDate]=useState(()=>manilaDay(new Date()));
  const [unit,setUnit]=useState('');
  const [units,setUnits]=useState<Results['units']>([]);
  const [rows,setRows]=useState<Results['results']|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    setRows(null); setError('');
    operationsRpc<Results>('ops_checklist_results',{p_date:date,p_unit:unit||null})
      .then(data=>{if(active){setUnits(data.units);setRows(data.results);}})
      .catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[date,unit]);
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <Field label="Submission date"><input type="date" className={inputClass} value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></Field>
      <UnitPicker units={units} value={unit} onChange={setUnit}/>
    </div>
    {error?<p role="alert">{error}</p>:rows===null?<p role="status">Loading results…</p>:rows.length===0?<p>No checklists were submitted for this selection.</p>:rows.map(r=>
      <details key={r.id} className="rounded-xl border p-4">
        <summary className="cursor-pointer"><strong>{r.title}</strong> · {r.unit} · {r.outcome}</summary>
        <p className="my-3 text-sm">{formatDue(r.submitted_at)}{r.submitted_by&&' · '+r.submitted_by}</p>
        <ul className="divide-y">{r.items?.map((i,n)=><li key={n} className="py-2">
          <strong>{i.title}</strong> · {i.value==='na'?'Not applicable':i.value==='no'&&i.issue?'Issue found':i.value===true?'Done':i.value===false?'Unchecked':String(i.value??'Skipped')}{i.issue&&' · Issue flagged'}
          {i.remarks&&<p className="whitespace-pre-wrap">{i.remarks}</p>}
        </li>)}</ul>
      </details>)}
  </section>;
}

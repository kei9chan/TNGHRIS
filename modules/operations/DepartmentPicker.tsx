import React from 'react';

type Department = {id:string;name:string};
export const selectedDepartments=(scope:{department_ids?:string[];department_id?:string})=>
 scope.department_ids ?? (scope.department_id ? [scope.department_id] : []);

export default function DepartmentPicker({departments,selected,onChange}:{departments:Department[];selected:string[];onChange:(ids:string[])=>void}){
 const operations=departments.filter(d=>/^operations(?:\s*-|$)/i.test(d.name)).map(d=>d.id);
 return <fieldset className="space-y-2"><legend className="text-sm font-semibold">Departments</legend>
 <div className="flex gap-3 text-sm text-violet-700">{operations.length>0&&<button type="button" onClick={()=>onChange(operations)}>Select Operations</button>}<button type="button" onClick={()=>onChange([])}>All departments</button></div>
 <details className="rounded-xl border p-3"><summary>{selected.length?selected.length+' selected':'All departments'}</summary>
 <div className="mt-2 grid max-h-56 gap-2 overflow-auto">{departments.map(d=><label key={d.id} className="flex gap-2"><input type="checkbox" checked={selected.includes(d.id)} onChange={e=>onChange(e.target.checked?[...selected,d.id]:selected.filter(id=>id!==d.id))}/>{d.name}</label>)}</div></details></fieldset>;
}

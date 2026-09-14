import React, {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '../../services/supabaseClient';
import {useAuth} from '../../hooks/useAuth';
import {CaseRow, Filters, columns, defaultColumns, confidentiality, cellValue, exportFilters, safeLink} from './model';

type Result={rows:CaseRow[];total:number;summary:Record<string,any>;facets:Record<string,{label:string;value:string}[]>;canExport:boolean;canArchive:boolean};
const input='w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm';
const button='rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm disabled:opacity-40';
const panel='rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4';
const filterFields=[['buId','Business Unit','businessUnit'],['stage','Workflow stage','stage'],['employeeId','Employee','employee'],['department','Department','department'],['offense','Type of offense','offense'],['offenseCategory','Offense category','offenseCategory'],['handlerId','Case handler','handler'],['action','Action implemented','action']] as const;
const cardDefinitions:[string,string,Filters][]=[['total','Total cases',{}],['open','Open cases',{status:'Open'}],['closed','Closed cases',{stage:'Closed'}],['overdue','Overdue cases',{overdue:'true'}],['awaiting','Awaiting employee response',{stage:'Awaiting employee response'}],['approval','For approval',{stage:'For approval'}],['hr','For HR review',{stage:'For HR review'}],['hearing','Conference / hearing',{stage:'Scheduled for conference/hearing'}]];

export default function CaseRegister({mode}:{mode:'register'|'reports'|'archived'}){
 const {user}=useAuth();
 const [draft,setDraft]=useState<Filters>(mode==='archived'?{status:'Archived'}:{});
 const [filters,setFilters]=useState<Filters>(draft);
 const [page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const [result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [visible,setVisible]=useState<string[]>(defaultColumns),[selection,setSelection]=useState<Set<string>>(new Set());
 const [showColumns,setShowColumns]=useState(false),[showExport,setShowExport]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [format,setFormat]=useState('xlsx'),[layout,setLayout]=useState(mode==='reports'?'summary':'detailed');
 const [scope,setScope]=useState('filtered'),[exportBu,setExportBu]=useState(''),[exportStatus,setExportStatus]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const requestVersion=useRef(0),operation=useRef<AbortController|null>(null),operationLock=useRef(false),identity=useRef(user?.id);
 identity.current=user?.id;
 useEffect(()=>{setResult(null);setSelection(new Set());setShowExport(false);setError('');return()=>{requestVersion.current++;operation.current?.abort();};},[user?.id]);
 useEffect(()=>{
  const controller=new AbortController();const version=++requestVersion.current;const timer=setTimeout(()=>controller.abort(),20000);
  setLoading(true);setError('');setResult(null);
  void (async()=>{try{const {data,error:failure}=await supabase.rpc('get_case_register',{p_filters:filters,p_page:page,p_page_size:50}).abortSignal(controller.signal);if(failure)throw failure;if(controller.signal.aborted)throw new Error('Request timed out.');if(version===requestVersion.current)setResult(data as Result);}
  catch(e:any){if(version===requestVersion.current)setError(controller.signal.aborted?'The register took too long to respond. Narrow the filters or retry.':e.message||'Unable to load case register.');}
  finally{clearTimeout(timer);if(version===requestVersion.current)setLoading(false);}})();
  return()=>{clearTimeout(timer);controller.abort();};
 },[filters,page,revision,user?.id]);
 const apply=(next:Filters)=>{setDraft(next);setFilters(next);setPage(0);setSelection(new Set());setNotice('');};
 const quickFilter=(next:Filters)=>{const current={...filters};delete current.status;delete current.stage;delete current.overdue;apply({...current,...next,...(mode==='archived'?{status:'Archived'}:{})});};
 const chosen=columns.filter(([key])=>visible.includes(key));
 const filterControl=(key:string,value:string)=>setDraft(d=>({...d,[key]:value}));
 const download=async()=>{
  if(operationLock.current)return;operationLock.current=true;setBusy(true);setNotice('');const actor=user?.id;const controller=new AbortController();operation.current=controller;const timer=setTimeout(()=>controller.abort(),30000);
  try{
   if(!visible.length)throw new Error('Choose at least one column.');
   if(scope==='selected'&&!selection.size)throw new Error('Select at least one case.');
   const finalFilters=exportFilters(filters,scope,exportBu,exportStatus,from,to);
   const {data,error:failure}=await supabase.rpc('get_case_register',{p_filters:finalFilters,p_export:{format,layout,columns:visible,...(scope==='selected'?{selectedIds:[...selection]}:{})}}).abortSignal(controller.signal);
   if(failure)throw failure;if(controller.signal.aborted)throw new Error('The export request timed out.');
   clearTimeout(timer);
   if(!data?.auditId)throw new Error('Export audit was not recorded. No file was downloaded.');
   const {createReport}=await import('./export');const blob=await createReport(data.rows,visible,format,layout,{auditId:data.auditId,generatedAt:data.generatedAt,filters:finalFilters},window.location.origin);
   if(identity.current!==actor||controller.signal.aborted)return;
   const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`case-${layout}-${new Date().toISOString().slice(0,10)}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
   setNotice(`Downloaded ${data.total} records. Export audit: ${data.auditId}.`);setShowExport(false);
  }catch(e:any){if(identity.current===actor&&!controller.signal.aborted)setNotice(`Export failed: ${e.message||'Please retry.'}`);else if(identity.current===actor)setNotice('Export timed out. No file was downloaded. Retry once the connection is stable.');}
  finally{clearTimeout(timer);operationLock.current=false;setBusy(false);}
 };
 const archive=async(row:CaseRow)=>{
  if(operationLock.current)return;operationLock.current=true;setBusy(true);setNotice('');const controller=new AbortController();operation.current=controller;const timer=setTimeout(()=>controller.abort(),20000);const actor=user?.id;
  try{const {error:failure}=await supabase.rpc('set_case_register_archive',{p_row_key:row.id,p_archived:row.status!=='Archived'}).abortSignal(controller.signal);if(failure)throw failure;if(identity.current===actor){setRevision(r=>r+1);setSelection(new Set());setNotice(row.status==='Archived'?'Case restored to the register.':'Closed case archived. Its records are retained.');}}
  catch(e:any){if(identity.current===actor)setNotice(`Could not update archive: ${e.message}. Refresh to confirm the current state before retrying.`);}
  finally{clearTimeout(timer);operationLock.current=false;setBusy(false);}
 };
 return <section className="space-y-5 text-gray-900 dark:text-gray-100" aria-label="Case Monitoring and Reports">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{mode==='reports'?'Reports & Analytics':mode==='archived'?'Archived Cases':'Case Register'}</h1><p className="text-sm text-gray-500 dark:text-gray-400">Case Monitoring & Reports · One row per employee case / NTE. Dates use Philippine time.</p></div><div className="flex gap-2"><button className={button} onClick={()=>setShowColumns(v=>!v)}>Columns ({visible.length})</button><button className={button+' bg-indigo-600 text-white'} disabled={loading||!result?.canExport||busy} onClick={()=>{setScope('filtered');setExportBu(filters.buId||'');setShowExport(true);}}>Export report</button></div></div>
  <p className="text-xs text-amber-700 dark:text-amber-300">{confidentiality}</p>
  {showExport&&<section className={panel+' border-indigo-500'} aria-label="Export options"><h2 className="font-semibold text-lg">Export options</h2><p className="text-sm mb-3">Filtered and selected exports retain the applied table filters. “All accessible” starts a new authorized report scope. Additional dates narrow that scope.</p><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
   <label className="text-xs">Records<select className={input} value={scope} onChange={e=>setScope(e.target.value)}><option value="filtered">Filtered results</option><option value="selected">Selected rows only ({selection.size})</option><option value="bu">Current Business Unit</option><option value="all">All accessible Business Units</option></select></label>
   {scope==='bu'&&<label className="text-xs">Business Unit<select className={input} value={exportBu} onChange={e=>setExportBu(e.target.value)}><option value="">Choose BU</option>{result?.facets.businessUnit?.map(b=><option key={b.value} value={b.value}>{b.label}</option>)}</select></label>}
   <label className="text-xs">Case status<select className={input} value={exportStatus} onChange={e=>setExportStatus(e.target.value)}><option value="">Keep scope status</option><option value="Open">Open cases only</option><option value="Closed">Closed cases only</option></select></label>
   <label className="text-xs">Report<select className={input} value={layout} onChange={e=>setLayout(e.target.value)}><option value="detailed">Detailed case register</option><option value="summary">Summary report</option></select></label>
   <label className="text-xs">Format<select className={input} value={format} onChange={e=>setFormat(e.target.value)}><option value="xlsx">Excel / XLSX</option><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
   <label className="text-xs">Custom start date<input type="date" className={input} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-xs">Custom end date<input type="date" className={input} value={to} onChange={e=>setTo(e.target.value)}/></label>
  </div><p className="text-xs mt-3">Detailed exports include the {visible.length} checked columns. Summary exports group counts by BU and offense. CSV contains a confidentiality preamble; XLSX keeps numeric cells and clickable document links. PDF splits wide registers into column groups. Downloads are audited before release.</p><div className="flex gap-2 mt-3"><button className={button+' bg-indigo-600 text-white'} disabled={busy||!visible.length} onClick={download}>{busy?'Preparing audited export…':'Download report'}</button><button className={button} disabled={busy} onClick={()=>setShowExport(false)}>Cancel</button></div></section>}
  {showColumns&&<fieldset className={panel}><legend className="font-semibold">Visible and exported columns</legend><div className="flex gap-3 mb-3"><button className={button} onClick={()=>setVisible(columns.map(c=>c[0]))}>Show all</button><button className={button} onClick={()=>setVisible(defaultColumns)}>Reset columns</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{columns.map(([key,label])=><label key={key} className="text-sm flex gap-2"><input type="checkbox" checked={visible.includes(key)} onChange={()=>setVisible(v=>v.includes(key)?v.filter(k=>k!==key):[...v,key])}/>{label}</label>)}</div></fieldset>}
  <form className={panel+' grid gap-3 sm:grid-cols-2 lg:grid-cols-4'} onSubmit={e=>{e.preventDefault();if(draft.from&&draft.to&&draft.from>draft.to){setNotice('Start date must precede end date.');return;}apply(draft);}}>
   <label className="text-xs">Keyword / case reference<input className={input} value={draft.keyword||''} placeholder="Search reference, employee, summary…" onChange={e=>filterControl('keyword',e.target.value)}/></label>
   {filterFields.map(([key,label,facet])=><label className="text-xs" key={key}>{label}<select className={input} value={draft[key]||''} onChange={e=>filterControl(key,e.target.value)}><option value="">All accessible</option>{result?.facets[facet]?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>)}
   <label className="text-xs">Code / policy provision<input className={input} value={draft.policy||''} onChange={e=>filterControl('policy',e.target.value)}/></label>
   <label className="text-xs">Case status<select className={input} value={draft.status||''} disabled={mode==='archived'} onChange={e=>filterControl('status',e.target.value)}><option value="">All statuses</option>{['Open','Closed','Archived'].map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="text-xs">Deadline<select className={input} value={draft.overdue||''} onChange={e=>filterControl('overdue',e.target.value)}><option value="">All cases</option><option value="true">Overdue only</option></select></label>
   <label className="text-xs">Date range applies to<select className={input} value={draft.dateField||'reportedDate'} onChange={e=>filterControl('dateField',e.target.value)}>{[['reportedDate','Date reported'],['incidentDate','Incident date'],['servedDate','NTE served'],['closedDate','Date closed']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label className="text-xs">From<input type="date" className={input} value={draft.from||''} onChange={e=>filterControl('from',e.target.value)}/></label><label className="text-xs">Through (inclusive)<input type="date" className={input} value={draft.to||''} onChange={e=>filterControl('to',e.target.value)}/></label>
   <div className="flex items-end gap-2"><button className={button+' bg-indigo-600 text-white'} type="submit">Apply filters</button><button className={button} type="button" onClick={()=>apply(mode==='archived'?{status:'Archived'}:{})}>Clear</button></div>
  </form>
  {notice&&<p role="status" className={panel}>{notice}</p>}
  {error&&<div role="alert" className={panel}><p>{error}</p><button className={button+' mt-2'} onClick={()=>setRevision(r=>r+1)}>Retry register</button></div>}
  {loading&&<p role="status">Loading accessible case records…</p>}
  {result&&!loading&&<>
   {!result.canExport&&<p className="text-sm text-gray-500">Export requires the IncidentReports export permission. Your existing view permissions remain in effect.</p>}
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cardDefinitions.map(([key,label,f])=><button key={key} className={panel+' text-left hover:border-indigo-500'} onClick={()=>quickFilter(f)}><span className="text-sm text-gray-500 dark:text-gray-400">{label}</span><strong className="block text-2xl">{result.summary[key]??0}</strong></button>)}<button className={panel+' text-left'} onClick={()=>quickFilter({stage:'Closed'})}><span className="text-sm">Average resolution time</span><strong className="block text-2xl">{result.summary.averageResolution??'—'} {result.summary.averageResolution!==null?'days':''}</strong><span className="text-xs">{result.summary.resolutionSample} cases with recorded closure dates</span></button></div>
   <div className="grid md:grid-cols-2 gap-3">{[['byBusinessUnit','Cases per Business Unit','buId'],['byOffense','Cases by offense type','offense']].map(([key,title,field])=><div key={key} className={panel}><h2 className="font-semibold mb-2">{title}</h2><div className="flex flex-wrap gap-2">{result.summary[key]?.length?result.summary[key].map((g:any)=><button className={button} key={g.id||g.label||'unknown'} disabled={!g.label||(field==='buId'&&!g.id)} onClick={()=>apply({...filters,[field]:field==='buId'?g.id:g.label})}>{g.label||'Not recorded'} · {g.count}</button>):<span>No cases match.</span>}</div></div>)}</div>
   <p className="text-xs text-gray-500">Summaries reflect applied filters. Pending days run from date reported. Overdue means an unanswered response deadline or an IR review SLA has passed. Blank service, action, or closure fields mean no qualifying record exists. Document links reopen the authorized case; they do not grant attachment access.</p>
   <div className={panel+' overflow-x-auto'}><div className="flex flex-wrap justify-between mb-3 gap-2"><span>{result.total} matching records · {selection.size} selected</span><button className={button} onClick={()=>setSelection(new Set())}>Clear selection</button></div>
   {!visible.length?<p>Select a column to display the table.</p>:<table className="min-w-full text-sm"><caption className="sr-only">Administrative case register</caption><thead><tr><th className="p-2"><input type="checkbox" aria-label="Select current page" checked={result.rows.length>0&&result.rows.every(r=>selection.has(r.id))} onChange={e=>setSelection(old=>{const s=new Set(old);result.rows.forEach(r=>e.target.checked?s.add(r.id):s.delete(r.id));return s;})}/></th>{chosen.map(([key,label])=><th scope="col" className="p-3 text-left whitespace-nowrap border-b dark:border-gray-700" key={key}>{label}</th>)}<th className="p-3">Actions</th></tr></thead><tbody>{result.rows.map(row=><tr className="border-b dark:border-gray-700" key={row.id}><td className="p-2"><input type="checkbox" aria-label={`Select ${row.reference} ${row.employee}`} checked={selection.has(row.id)} onChange={e=>setSelection(old=>{const s=new Set(old);e.target.checked?s.add(row.id):s.delete(row.id);return s;})}/></td>{chosen.map(([key])=>{const value=cellValue(row,key,window.location.origin);const link=key.endsWith('Document')?safeLink(value,window.location.origin):null;return <td className="p-3 min-w-36 max-w-96 align-top" key={key}>{key==='reference'?<Link className="text-indigo-600 dark:text-indigo-300 underline" to={`?caseId=${row.incidentId}${row.employeeId?'&employeeId='+row.employeeId:''}`}>{value}</Link>:link?<a className="text-indigo-600 dark:text-indigo-300 underline" href={link} target="_blank" rel="noopener noreferrer">Open reference</a>:<span className={row.overdue&&key==='dueDate'?'text-red-600 dark:text-red-300':''}>{value===''?'—':value}</span>}</td>})}<td className="p-3">{result.canArchive&&row.stage==='Closed'&&<button className={button} disabled={busy} onClick={()=>archive(row)}>{row.status==='Archived'?'Restore':'Archive'}</button>}</td></tr>)}</tbody></table>}
   {!result.rows.length&&<p className="p-6 text-center">No accessible cases match these filters.</p>}</div>
   <div className="flex justify-end items-center gap-3"><button className={button} disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(result.total/50))}</span><button className={button} disabled={(page+1)*50>=result.total} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </>}

 </section>;
}

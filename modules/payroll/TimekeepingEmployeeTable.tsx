import React,{useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import Button from '../../components/ui/Button';
import type {ReviewTimeRow,TestTimeEvidence} from './attendanceReadiness';
import {correctionLink,employeeReviews,timeTotals} from './timeReviewModel';
import {downloadHistoricalSource,historyDetail} from './historicalAttendance';

const link='text-indigo-700 underline dark:text-indigo-300';
const num=(value:number)=>value.toLocaleString('en-PH',{maximumFractionDigits:4});
const stamp=(value:string)=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
export const TimekeepingEmployeeTable:React.FC<{rows:ReviewTimeRow[];test:TestTimeEvidence[];saved:boolean;canOpenOffset:boolean;busy:boolean;hasReason:boolean;onOpenOffset:(id:string)=>void}>=({rows,test,saved,canOpenOffset,busy,hasReason,onOpenOffset})=>{
 const [search,setSearch]=useState('');const [blocked,setBlocked]=useState(false);const [page,setPage]=useState(0);const [expanded,setExpanded]=useState<string|null>(null);
 const employees=useMemo(()=>employeeReviews(rows,test),[rows,test]);const totals=useMemo(()=>timeTotals(rows),[rows]);
 const filtered=employees.filter(e=>(!blocked||e.totals.blockedDays>0)&&e.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1));const visible=filtered.slice(currentPage*25,currentPage*25+25);
 return <div className="space-y-4">
  <p className="text-sm">Cutoff totals (all employees): <strong>{num(totals.scheduledMinutes)} scheduled · {num(totals.actualMinutes)} actual · {num(totals.lateMinutes)} late · {num(totals.undertimeMinutes)} undertime · {num(totals.approvedOtMinutes)} approved OT minutes</strong>. {totals.missingPunchDays} days have missing or unpaired punch issues. Test evidence is excluded from every live total.</p>
  <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Find employee<input className="ml-2 rounded border bg-transparent p-2" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Employee name"/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blocked} onChange={e=>{setBlocked(e.target.checked);setPage(0);}}/>Unresolved blockers only</label><span className="text-sm">{filtered.length} of {employees.length} employees</span></div>
  <p className="text-xs">All amounts below are minutes. Expand an employee to inspect daily evidence and open the existing correction workflow. Late/undertime values are the existing engine’s results, not new deductions.</p>
  <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><caption className="sr-only">Employee timekeeping review for the selected business unit and cutoff</caption><thead><tr>{['Employee','Published schedule','Actual / source','Missing punches','Late / undertime','Leave','Approved / actual OT','Readiness'].map(h=><th key={h} scope="col" className="p-3 align-top">{h}</th>)}</tr></thead><tbody>
  {visible.map(e=><React.Fragment key={e.id}><tr className="border-t dark:border-slate-700">
   <th scope="row" className="p-3 align-top font-medium"><button className={`${link} text-left`} aria-expanded={expanded===e.id} onClick={()=>setExpanded(expanded===e.id?null:e.id)}>{e.name}<span className="block text-xs">{expanded===e.id?'Hide':'Review'} daily details</span></button></th>
   <td className="p-3 align-top">{e.totals.publishedDays} / {e.totals.days} days<p>{num(e.totals.scheduledMinutes)} min</p></td>
   <td className="p-3 align-top">{num(e.totals.actualMinutes)} min<p className="text-xs">Break: {num(e.totals.breakMinutes)} min</p>{e.days.some(d=>d.requiresClock===false)&&<p className="text-xs">Includes approved schedule-based attendance</p>}{e.test.length>0&&<p className="mt-1 font-medium text-amber-700 dark:text-amber-300">{e.test.length} historical test records — separate</p>}</td>
   <td className="p-3 align-top">{e.totals.missingPunchDays} affected days</td><td className="p-3 align-top">{num(e.totals.lateMinutes)} / {num(e.totals.undertimeMinutes)}</td>
   <td className="p-3 align-top">{e.totals.leaveDays} approved full days<p className="text-xs">{new Set(e.days.flatMap(d=>d.leaveIds)).size} source requests</p></td><td className="p-3 align-top">{num(e.totals.approvedOtMinutes)} / {num(e.totals.actualOtMinutes)}</td>
   <td className="p-3 align-top font-medium">{!e.days.length?'Test evidence only':e.totals.blockedDays?<span className="text-red-700 dark:text-red-300">{e.totals.blockedDays} blocked days</span>:<span className="text-green-700 dark:text-green-300">Checks passed</span>}</td>
  </tr>{expanded===e.id&&<tr><td colSpan={8} className="bg-gray-50 p-4 dark:bg-slate-900"><div className="space-y-4">{e.days.map(day=><DayDetail key={day.date} row={day} saved={saved} canOpenOffset={canOpenOffset} busy={busy} hasReason={hasReason} onOpenOffset={onOpenOffset}/>)}{e.test.length>0&&<HistoricalSources records={e.test}/>}</div></td></tr>}</React.Fragment>)}
  {!visible.length&&<tr><td colSpan={8} className="p-5">{employees.length?'No employees match these filters.':'No employee records for this cutoff.'}</td></tr>}
  </tbody></table></div>
  {filtered.length>25&&<div className="flex items-center gap-3"><Button variant="secondary" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</Button><span>Page {currentPage+1} of {Math.ceil(filtered.length/25)}</span><Button variant="secondary" disabled={(currentPage+1)*25>=filtered.length} onClick={()=>setPage(currentPage+1)}>Next</Button></div>}
 </div>;
};

const DayDetail:React.FC<{row:ReviewTimeRow;saved:boolean;canOpenOffset:boolean;busy:boolean;hasReason:boolean;onOpenOffset:(id:string)=>void}>=({row:r,saved,canOpenOffset,busy,hasReason,onOpenOffset})=>{
 const evidence=r.evidence;
 return <section className="rounded-lg border bg-white p-4 dark:border-slate-700 dark:bg-slate-800"><h3 className="font-semibold">{r.date} · {r.restDay?'Rest day':r.approvedFullLeave?'Approved leave':'Workday'}{r.holiday?' · Holiday':''} · {r.ready?'Checks passed':'Needs review'}</h3>
  {r.officialBusiness&&<p>Official Business · {r.officialBusiness.reference} · {r.officialBusiness.status}</p>}
  <div className="mt-3 grid gap-4 lg:grid-cols-3">
   <div><h4 className="font-medium">Schedule · {evidence?.scheduleStatus||'evidence unavailable'}</h4><p>{num(r.scheduledMinutes)} scheduled minutes</p>{evidence?.shifts.map((s,i)=><p key={`${s.id}-${i}`} className="mt-1 text-xs">{s.name||s.kind||'Shift'} · {s.start||'—'}–{s.end||'—'}{s.endDayOffset?` (+${s.endDayOffset} day)`:''}<span className="block break-all">Publication {s.publicationId||'reference unavailable'}{s.publicationVersion?` · v${s.publicationVersion}`:''}</span></p>)}</div>
   <div><h4 className="font-medium">Attendance evidence</h4><p>{num(r.actualMinutes)} actual · {num(r.breakMinutes)} break minutes</p>{r.requiresClock===false&&<p className="text-xs">Approved schedule-based attendance exception; punches are not fabricated.</p>}{evidence?.punches.length?evidence.punches.map((p,i)=><p key={`${p.id}-${i}`} className="mt-1 text-xs">{p.type} · {stamp(p.timestamp)} PHT<span className="block break-all">{p.source||'Recorded'} · {p.id}{p.revision!=null?` · revision ${p.revision}`:''}</span></p>):<p className="text-xs">No punch evidence in this result. See attendance requirements and blockers.</p>}<p className="mt-2">Late {num(r.lateMinutes)} · Undertime {num(r.undertimeMinutes)}</p></div>
   <div><h4 className="font-medium">Leave and OT approval evidence</h4><p>Approved OT {num(r.approvedOtMinutes)} · Actual OT {num(r.actualOtMinutes)}</p>{evidence?.leave.map(l=><p key={l.id} className="mt-1 break-all text-xs">{l.type} · {l.status}{l.configurationRequired?' · approval setup incomplete':''} · {l.startDate}–{l.endDate} · {l.id}</p>)}{evidence?.ot.map(o=><p key={o.id} className="mt-1 break-all text-xs">{o.type} OT · {o.status}{o.configurationRequired?' · approval setup incomplete':''} · {o.start}–{o.end} · {o.approvedHours??'—'} approved hours · {o.id}{o.reviewRef?` · ${o.reviewRef}`:''}</p>)}{!r.leaveIds.length&&<p className="text-xs">No leave source requests.</p>}</div>
  </div>
  {r.issues.length>0&&<ul className="mt-4 space-y-2 border-t pt-3 dark:border-slate-700">{r.issues.map(issue=>{const target=correctionLink(issue,r);return <li key={issue}><span className="font-medium">{issue}</span>{!saved&&<span className="block text-xs"><Link className={link} to={target.path}>{target.label}</Link> · Responsible: {target.owner}</span>}</li>;})}</ul>}
  <details className="mt-3 text-xs"><summary>Original source IDs</summary><p className="break-all">Shifts: {r.shiftIds.join(', ')||'none'}<br/>Punches: {r.eventIds.join(', ')||'none'}<br/>Leave: {r.leaveIds.join(', ')||'none'}</p></details>
  {canOpenOffset&&!saved&&r.ot.filter(o=>o.type==='Offset'&&o.status==='Approved').map(o=><Button key={o.id} className="mt-3" size="sm" variant="secondary" disabled={busy||!hasReason} onClick={()=>onOpenOffset(o.id)}>Open offset approval review</Button>)}
 </section>;
};

const HistoricalSources:React.FC<{records:TestTimeEvidence[]}>=({records})=>{
 const [error,setError]=useState('');const [downloading,setDownloading]=useState(false);const [page,setPage]=useState(0);
 const download=async(id:string)=>{setError('');setDownloading(true);try{downloadHistoricalSource(await historyDetail(id,true));}catch(e){setError(e instanceof Error?e.message:'Source download failed.');}finally{setDownloading(false);}};
 const batches=[...new Map<string,TestTimeEvidence>(records.map(r=>[r.batchId,r] as [string,TestTimeEvidence])).values()];const current=Math.min(page,Math.max(0,Math.ceil(records.length/50)-1));
 return <section className="space-y-3 rounded border border-amber-400 p-4"><h3 className="font-bold">Historical test evidence · not live attendance</h3><p>Documented imports remain separate from live totals, approval checks and submission. DTR totals do not create punches or approve OT.</p>{error&&<p role="alert" className="text-red-700">{error}</p>}
 {batches.map(b=><div key={b.batchId} className="text-xs"><Button size="sm" variant="secondary" disabled={downloading} onClick={()=>void download(b.batchId)}>Download {b.filename}</Button><p>{b.reference} · Batch {b.batchId}</p></div>)}
 <ul className="space-y-2 text-xs">{records.slice(current*50,current*50+50).map(r=><li key={r.id}><strong>{r.workDate} · {r.kind==='dtr'?'Reviewed DTR summary':'Recorded punch'} · {r.filename} row {r.sourceRow}</strong>{r.kind==='dtr'?<p>Regular {num(r.payload.minutes?.REGULARMINUTES??0)} · OT {num(r.payload.minutes?.OVERTIMEMINUTES??0)} · Night {num(r.payload.minutes?.NIGHTMINUTES??0)} · Late {num(r.payload.minutes?.LATEMINUTES??0)} · Undertime {num(r.payload.minutes?.UNDERTIMEMINUTES??0)} · Unpaid break {num(r.payload.minutes?.UNPAIDBREAKMINUTES??0)} minutes · {r.payload.reviewReference}</p>:<p>{r.payload.action} · {r.payload.timestamp?stamp(r.payload.timestamp):'Time unavailable'} PHT · {r.payload.sourceReference}</p>}</li>)}</ul>
 {records.length>50&&<div className="flex items-center gap-3"><Button size="sm" variant="secondary" disabled={!current} onClick={()=>setPage(current-1)}>Previous sources</Button><span>{current*50+1}–{Math.min((current+1)*50,records.length)} of {records.length}</span><Button size="sm" variant="secondary" disabled={(current+1)*50>=records.length} onClick={()=>setPage(current+1)}>Next sources</Button></div>}
 <Link className={link} to="/payroll/historical-attendance">Open import validation and audit history</Link>
 </section>;
};

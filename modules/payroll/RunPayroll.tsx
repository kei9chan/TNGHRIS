import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../hooks/useAuth';
import {canImportActualAttendance} from './scheduleScope';
import {usePayrollField} from './usePayrollSelection';
import {useCalculationSelection} from './useCalculationSelection';
import {fetchTimeContext,previewTime,saveTime,TimeScope,TimePreview} from './attendanceReadiness';
import {grossContext,grossRuns,getGrossRun,prepareGross,GrossScope,GrossRun} from './grossPay';
import {netWorkspace,prepareNet,getNetRun,NetRun} from './netPay';
import {supabase} from '../../services/supabaseClient';
import {Readiness,validCutoff} from './workspace';
import NormalPayrollPeriodSelector,{ConfiguredPeriod} from './NormalPayrollPeriodSelector';
import {payrollCycleForCutoff,formatPayrollDate} from './payrollCycle';
import {downloadText} from './actualAttendanceImport';

const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900';
const button='inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-200 px-4 py-3 text-sm font-semibold text-violet-700 disabled:opacity-50 dark:text-violet-300';
const peso=(value:string|number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value));
const sources=[['Schedule','/payroll/timekeeping'],['Attendance','/payroll/attendance-readiness'],['Leave','/payroll/leave'],['Pay package','/payroll/pay-packages'],['Loans and deductions','/payroll/loans'],['Service charge','/payroll/service-charge']] as const;
type Scope=TimeScope&{gross?:GrossScope};
export default function RunPayroll(){
 const {user}=useAuth();
 const [scope,setScope]=usePayrollField('scope'),[from]=usePayrollField('from'),[to]=usePayrollField('to');
 return <PayrollWorkspace key={`${user?.id}:${scope}:${from}:${to}`} scope={scope} setScope={setScope} from={from} to={to}/>;
}
function PayrollWorkspace({scope,setScope,from,to}:{key?:string;scope:string;setScope:(v:string)=>void;from:string;to:string}){
 const {user}=useAuth();
 const [selection,remember]=useCalculationSelection(scope,from,to);
 const [scopes,setScopes]=useState<Scope[]>([]),[readiness,setReadiness]=useState<Readiness|null>(null),[time,setTime]=useState<TimePreview|null>(null);
 const [gross,setGross]=useState<GrossRun|null>(null),[net,setNet]=useState<NetRun|null>(null),[existing,setExisting]=useState('');
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[onlyIssues,setOnlyIssues]=useState(false),[employee,setEmployee]=useState('');
 const [cycle,setCycle]=useState<ConfiguredPeriod|null>(null);
 const unit=scopes.find(s=>s.id===scope),fresh=!!net?.current;
 useEffect(()=>{let active=true;setBusy(true);setError('');
  (async()=>{const [t,g]=await Promise.all([fetchTimeContext(),grossContext()]);if(!active)return;
   const combined=t.scopes.filter(s=>s.canView).map(s=>({...s,gross:g.scopes.find(x=>x.id===s.id)}));setScopes(combined);
   if(!combined.some(s=>s.id===scope)){setScope(combined[0]?.id||'');return;}if(!validCutoff(from,to))return;
   const [r,p,runs]=await Promise.all([supabase.rpc('get_payroll_home_readiness',{p_scope:scope,p_from:from,p_to:to}),previewTime(scope,from,to),g.scopes.find(s=>s.id===scope)?.canView?grossRuns(scope):Promise.resolve([])]);
   if(!active)return;if(r.error)throw r.error;setReadiness(r.data);setTime(p);
   const saved=runs.filter(x=>x.from===from&&x.to===to).sort((a,b)=>b.version-a.version)[0];setExisting(saved?.id||'');
   if(selection.grossId&&saved){const gr=await getGrossRun(selection.grossId);if(!active)return;if(gr.from===from&&gr.to===to){setGross(gr);const w=await netWorkspace(gr.id);const id=w.runs.filter(n=>n.grossId===gr.id).sort((a,b)=>b.version-a.version)[0]?.id;if(id){const nr=await getNetRun(id);if(active)setNet(nr);}}}
  })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};
 },[scope,from,to,revision]);
 async function openExisting(){setBusy(true);setError('');try{const gr=await getGrossRun(existing);const w=await netWorkspace(gr.id);const id=w.runs.filter(r=>r.grossId===gr.id).sort((a,b)=>b.version-a.version)[0]?.id;const nr=id?await getNetRun(id):null;setGross(gr);setNet(nr);remember({grossId:gr.id,netId:nr?.id||''});setStep(1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const submitted=time?.packages.find(p=>p.status==='submitted'&&p.current&&!p.blockedDays);
 async function calculate(){if(!submitted)return;if(existing&&!gross){setError('Open the existing payroll before choosing to recalculate it.');return;}setBusy(true);setError('');setNotice('');try{
  const id=await prepareGross(submitted.id,'Normal payroll calculation from approved packages and submitted actual timekeeping');const gr=await getGrossRun(id);setGross(gr);remember({grossId:id,netId:''});setNet(null);
  const w=await netWorkspace(id);
  if(!w.review){setNotice('Gross calculation saved. Finance must review contribution bases, tax history and authorized deductions before take-home pay can be calculated.');setStep(1);return;}
  const nid=await prepareNet(id,'Normal payroll calculation using reviewed statutory and deduction inputs');const nr=await getNetRun(nid);setNet(nr);remember({grossId:id,netId:nid});setStep(1);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function saveDraft(){setBusy(true);setError('');try{if(net||gross){setNotice('This calculation is already saved as a persistent draft. No payments or payslips were released.');return;}if(!time||!unit?.canFinalize)throw new Error('Only the assigned HR finalizer can save the timekeeping draft. Your selected business unit and period are retained.');await saveTime(scope,from,to,time.sourceHash,'Saved from Prepare payroll — not submitted');setNotice('Timekeeping draft saved. It has not been submitted for approval or payment.');setRevision(x=>x+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function exportDraft(kind:'register'|'contributions'|'deductions'|'payslips'){
  if(!net)return;setBusy(true);setError('');try{const current=await getNetRun(net.id);if(!current.current){setNet(current);throw new Error('Source records changed. Recalculate before generating draft documents.');}
   if(kind==='payslips'){
    const {jsPDF}=await import('jspdf');const pdf=new jsPDF();
    current.result.employees.forEach((e,i)=>{if(i)pdf.addPage();pdf.setFontSize(19);pdf.text('DRAFT - NOT RELEASED',20,24);pdf.setFontSize(13);pdf.text(e.employeeName,20,40);pdf.setFontSize(10);pdf.text(`${unit?.name||''} | ${from} to ${to}`,20,49);pdf.text(`Pay date: ${current.payDate}`,20,56);
     const rows=[['Gross pay',e.gross],['Employee deductions',e.deductions],['Take-home pay',e.net],['Withholding tax (included in deductions)',e.tax],['Mandatory deductions (included in deductions)',e.mandatory],...e.loans.map(l=>[`Loan: ${l.account}`,l.amount]),...e.otherDeductions.map(d=>[d.label,d.amount])];
     let y=73;rows.forEach(([label,value])=>{if(y>265){pdf.addPage();y=25;pdf.text('DRAFT - NOT RELEASED (continued)',20,y);y+=14;}const lines=pdf.splitTextToSize(label,115);pdf.text(lines,20,y);pdf.text(`PHP ${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`,190,y,{align:'right'});y+=Math.max(10,lines.length*5+4);});
     pdf.setFontSize(9);pdf.text('For review only. No payment or employee payslip release has occurred.',20,285);
    });pdf.save(`DRAFT-payslips-${from}-${to}.pdf`);return;
   }
   const rows:string[][]=[['DRAFT — NOT RELEASED'],['Business unit',unit?.name||''],['Cutoff',from,to],['Pay date',current.payDate]];
   if(kind==='register'){rows.push(['Employee','Gross','Deductions','Net','Employer contributions']);current.result.employees.forEach(e=>rows.push([e.employeeName,e.gross,e.deductions,e.net,e.employer]));}
   if(kind==='contributions'){rows.push(['Employee','Contribution','Monthly due','Previous cutoff','This cutoff']);current.result.employees.forEach(e=>e.contributions.forEach(c=>rows.push([e.employeeName,c.label,c.monthly,c.prior,c.amount])));}
   if(kind==='deductions'){rows.push(['Employee','Deduction','Amount','Source reference']);current.result.employees.forEach(e=>{e.loans.forEach(l=>rows.push([e.employeeName,l.account,l.amount,l.sourceRef]));e.otherDeductions.forEach(d=>rows.push([e.employeeName,d.label,d.amount,d.sourceRef]));});}
   downloadText(`DRAFT-${kind}-${from}-${to}.csv`,rows.map(r=>r.map(v=>`"${(/^[=+@-]/.test(v)?"'":'')+v.replaceAll('"','""')}"`).join(',')).join('\r\n'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const people=new Map<string,{name:string;issues:{date:string;message:string}[]}>();time?.result.rows.forEach(r=>{if(!people.has(r.employeeId))people.set(r.employeeId,{name:r.employeeName,issues:[]});r.issues.forEach(message=>people.get(r.employeeId)!.issues.push({date:r.date,message}));});
 const pendingEmployees=[...people.values()].filter(p=>p.issues.length).length;
 const titles=['Prepare payroll','Review payroll','Generate & approve'];
 return <main className="min-h-screen bg-violet-50/40 p-4 pb-28 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-7 sm:pb-28">
  <header className="mb-6 flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{titles[step]}</h1><p className="mt-2 text-slate-500">{step===0?'Set schedules, import actual attendance, then calculate.':step===1?'Review the amounts, fix issues, then generate.':'Draft documents do not release payments or publish payslips.'}</p></div><span className={`rounded-full px-4 py-2 text-sm font-semibold ${net&&!fresh?'bg-amber-100 text-amber-900':'bg-violet-100 text-violet-800'}`}>{net?fresh?'Calculated draft':'Needs recalculation':gross?'Gross calculated · Finance review needed':'Draft'}</span></header>
  <div className="mb-5 grid gap-4 lg:grid-cols-2"><label className="text-sm font-semibold">Business unit<select aria-label="Business unit" disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3 dark:bg-slate-900" value={scope} onChange={e=>setScope(e.target.value)}><option value="">Choose business unit</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><NormalPayrollPeriodSelector disabled={busy} onPeriod={setCycle}/></div>
  <nav aria-label="Payroll steps" className="mb-6 flex gap-3">{['Prepare','Review','Generate & approve'].map((label,i)=><button key={label} disabled={i>0&&!gross||i===2&&!fresh} onClick={()=>setStep(i)} aria-current={step===i?'step':undefined} className={`flex-1 rounded-xl border p-3 text-sm font-semibold disabled:opacity-40 ${step===i?'border-violet-600 bg-violet-600 text-white':'bg-white dark:bg-slate-900'}`}>{i+1}. {label}</button>)}</nav>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-blue-900">{notice}</p>}
  {busy&&<p role="status" className="mb-4">Loading saved payroll records…</p>}
  {existing&&!gross&&<div className={`${panel} mb-5 flex flex-wrap items-center justify-between gap-3`}><p>A payroll calculation already exists for this cutoff.</p><button className={button} disabled={busy} onClick={()=>void openExisting()}>Open existing payroll</button></div>}
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-4">
  {step===0&&<>
   <ReadinessCard title="1. Schedules" status={readiness?`${readiness.publishedDays} of ${readiness.totalDays} employee-days published`:'Checking schedules'} ready={!!readiness&&readiness.totalDays>0&&readiness.publishedDays===readiness.totalDays}><Link className={button} to={`/payroll/timekeeping?week=${from}&source=payroll&businessUnit=${encodeURIComponent(unit?.name||'')}`}>Open Schedule Builder</Link></ReadinessCard>
   <ReadinessCard title="2. Attendance" status={time?pendingEmployees?`${pendingEmployees} employees need review`:`${people.size} employees ready for timekeeping review`:'Attendance readiness not yet checked'} ready={!!time&&!pendingEmployees&&people.size>0}>{canImportActualAttendance(user)&&<><Link className={`${button} bg-violet-600 !text-white`} to="/payroll/import-attendance">Import attendance</Link><Link className={button} to="/payroll/import-attendance">Enter manually</Link></>}<Link className={button} to="/payroll/attendance-readiness">Review & finalize timekeeping</Link></ReadinessCard>
   <ReadinessCard title="3. Pay packages" status={readiness?.payVisible?`${readiness.reviewedPayEmployees} of ${readiness.employees} employees have approved base-pay coverage`:'Package readiness requires compensation access'} ready={!!readiness?.payVisible&&readiness.employees>0&&readiness.reviewedPayEmployees===readiness.employees}><Link className={button} to="/payroll/pay-packages">View packages</Link></ReadinessCard>
   <details className={panel}><summary className="cursor-pointer text-lg font-bold">Additional records, if needed</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['Import leave opening balances','/payroll/leave-balances/import'],['Add leave taken','/payroll/leave'],['Loans and authorized deductions','/payroll/loans'],['Allowances and reimbursements','/payroll/pay-packages'],['Add service charge','/payroll/service-charge']].map(([label,path])=><Link className={button} key={label} to={path}>{label}</Link>)}</div></details>
  </>}
  {step>0&&<>
   <div className="grid gap-4 sm:grid-cols-3">{[['Gross pay',net?.result.gross||gross?.result.gross],['Employee deductions',net?.result.deductions],['Take-home pay',net?.result.net]].map(([label,value])=><div className={panel} key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value!==undefined?peso(value):'Finance review required'}</p></div>)}</div>
   {!net&&<section className={panel}><h2 className="font-bold">Complete Finance inputs</h2><p className="my-3 text-sm">Review applicable statutory bases, prior contributions, year-to-date tax and authorized deductions. Missing figures are not assumed to be zero.</p><Link to="/payroll/net-pay" className={button}>Review Finance inputs</Link></section>}
   {net&&!fresh&&<p role="alert" className="rounded-xl bg-amber-100 p-4 text-amber-900">Needs recalculation. {net.staleReason} Draft generation and approval are disabled until current sources are calculated.</p>}
   <section className={panel}><div className="mb-4 flex justify-between gap-3"><h2 className="font-bold">{net?.result.employees.length||gross?.result.employees.length||0} employees</h2><label className="text-sm"><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Show issues only</label></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-violet-50 dark:bg-slate-800"><tr>{['Employee','Attendance','Gross','Deductions','Net','Action'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{(net?.result.employees||gross?.result.employees||[]).filter(e=>!onlyIssues||people.get(e.employeeId)?.issues.length).map(e=>{const n=net?.result.employees.find(x=>x.employeeId===e.employeeId),issues=people.get(e.employeeId)?.issues||[];return <tr className="border-t" key={e.employeeId}><td className="p-3 font-medium">{e.employeeName}</td><td className="p-3">{issues.length?`${issues.length} issues`:time?'Ready':'Not checked'}</td><td className="p-3">{peso(e.gross)}</td><td className="p-3">{n?peso(n.deductions):'Review needed'}</td><td className="p-3">{n?peso(n.net):'Review needed'}</td><td className="p-3"><button className="text-violet-600" onClick={()=>setEmployee(e.employeeId===employee?'':e.employeeId)}>View breakdown</button></td></tr>;})}</tbody></table></div></section>
   {employee&&<section className={panel}><h2 className="font-bold">{people.get(employee)?.name||'Employee details'}</h2>{people.get(employee)?.issues.map((i,n)=><p className="mt-2 text-amber-700" key={n}>{i.date} — {i.message}</p>)}{gross?.result.employees.find(e=>e.employeeId===employee)?.lines.map((l,n)=><p className="mt-2 text-sm" key={n}>{l.date} · {l.label}: {peso(l.amount)}</p>)}<div className="mt-4 flex flex-wrap gap-3">{sources.map(([label,path])=><Link className={button} key={label} to={`${path}?employee=${employee}`}>{label}</Link>)}</div></section>}
   {net&&<section className={panel}><h2 className="font-bold">Employer cost</h2><p className="mt-3">Gross employee compensation: {peso(net.result.gross)}</p><p>Employer statutory contributions: {peso(net.result.employer)}</p><p className="mt-3 text-lg font-bold">Total company payroll cost: {peso(net.result.employerTotalCost||String(Number(net.result.gross)+Number(net.result.employer)))}</p><p className="mt-2 text-sm text-slate-500">Employee deductions reduce take-home pay, not employer cost.</p></section>}
  </>}
  </div><aside className="space-y-4"><section className={panel}><h2 className="text-xl font-bold">This payroll</h2><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><dt>Pay date</dt><dd>{cycle?formatPayrollDate(cycle.releaseDate):'Confirm payroll calendar'}</dd></div><div className="flex justify-between gap-3"><dt>Cutoff</dt><dd>{from}–{to}</dd></div><div className="flex justify-between"><dt>Employees</dt><dd>{readiness?.employees??'Not checked'}</dd></div></dl><button className={`${button} mt-5`} disabled={busy} onClick={()=>setRevision(x=>x+1)}>Refresh readiness</button></section>
   {step>0&&<section className={panel}><h2 className="text-xl font-bold">Generate draft documents</h2><p className="my-3 text-sm text-slate-500">DRAFT — NOT RELEASED. These downloads do not submit filings or publish payslips.</p>{[['payslips','Download draft payslips'],['register','Download draft payroll register'],['contributions','Government-contribution breakdown'],['deductions','View deduction schedule']].map(([kind,label])=><button className={`${button} mt-3 w-full`} disabled={busy||!fresh} key={kind} onClick={()=>void exportDraft(kind as 'register'|'contributions'|'deductions'|'payslips')}>{label}</button>)}</section>}
   {!submitted&&step===0&&<section className={`${panel} text-sm`}><h2 className="font-bold">Next: prepare and finalize timekeeping</h2><p className="mt-2">HR must submit the actual attendance review before Finance calculates payroll. Existing approval permissions are unchanged.</p></section>}
  </aside></div>
  <footer className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t bg-white px-5 py-4 dark:bg-slate-900"><p className="text-sm text-slate-500">Saved drafts do not release payments.</p><div className="flex gap-3"><button className={button} disabled={busy} onClick={()=>void saveDraft()}>Save draft</button>{step===2&&fresh?<Link className={`${button} bg-violet-600 !text-white`} to={`/payroll/approvals?net=${net!.id}`}>Submit for approval</Link>:step===1&&fresh?<button className={`${button} bg-violet-600 !text-white`} onClick={()=>setStep(2)}>Generate & approve →</button>:<button className={`${button} bg-violet-600 !text-white`} disabled={busy||!submitted||!unit?.gross?.canCalculate} onClick={()=>void calculate()}>{gross?'Recalculate payroll':'Calculate payroll'}</button>}</div></footer>
 </main>;
}
function ReadinessCard({title,status,ready,children}:{title:string;status:string;ready:boolean;children:React.ReactNode}){return <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}><div><h2 className="text-xl font-bold">{title}</h2><p className={`mt-2 font-medium ${ready?'text-emerald-700':'text-amber-700'}`}>{status}</p></div><div className="flex flex-wrap gap-2">{children}</div></section>;}

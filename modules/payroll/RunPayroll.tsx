import React,{useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {ReviewForm} from './NetPayPage';
import Modal from '../../components/ui/Modal';
import {PayrollBreakdown} from './PayrollBreakdown';
import {useAuth} from '../../hooks/useAuth';
import {canImportActualAttendance} from './scheduleScope';
import {usePayrollField} from './usePayrollSelection';
import {useCalculationSelection} from './useCalculationSelection';
import {fetchTimeContext,fetchPreparation,saveTime,prepareAttendance,TimeScope,TimePreview} from './attendanceReadiness';
import {grossContext,grossRuns,getGrossRun,prepareGross,setShadow,GrossScope,GrossRun} from './grossPay';
import {getNetRun,saveNetReview,NetWorkspace,NetInputs,NetRun} from './netPay';
import {automaticPayrollWorkspace as netWorkspace,calculateAutomaticPayroll} from './automaticPayroll';
import {supabase} from '../../services/supabaseClient';
import {Readiness,validCutoff} from './workspace';
import NormalPayrollPeriodSelector,{ConfiguredPeriod} from './NormalPayrollPeriodSelector';
import PreviousPaymentCard from './PreviousPaymentCard';
import RecordedBreakApprovals from './RecordedBreakApprovals';
import AttendanceImportApprovals from './AttendanceImportApprovals';
import {payrollCycleForCutoff,formatPayrollDate} from './payrollCycle';
import {downloadText} from './actualAttendanceImport';
import {getNormalApproval,requestNormalApproval,submitApproval,type Approval} from './approvals';
import {Role} from '../../types';

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
 const navigate=useNavigate();
 const [params]=useSearchParams();
 const [preflight,setPreflight]=useState<{code:string;message:string;employeeName?:string;employeeId?:string;canApprove?:boolean;compensationType?:string}[]|null>(null);
 const [finance,setFinance]=useState<NetWorkspace|null>(null);
 const [selection,remember]=useCalculationSelection(scope,from,to);
 const [scopes,setScopes]=useState<Scope[]>([]),[readiness,setReadiness]=useState<Readiness|null>(null),[time,setTime]=useState<TimePreview|null>(null);
 const [gross,setGross]=useState<GrossRun|null>(null),[net,setNet]=useState<NetRun|null>(null),[existing,setExisting]=useState('');
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[loadingSaved,setLoadingSaved]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[onlyIssues,setOnlyIssues]=useState(false),[employee,setEmployee]=useState('');
 const lastFocusRefresh=useRef(Date.now());
 const [cycle,setCycle]=useState<ConfiguredPeriod|null>(null);
 const [approval,setApproval]=useState<Approval|null>(null);
 const [approvedAttendance,setApprovedAttendance]=useState<{employees:number;days:number;fixes:number}|null>(null);
 const unit=scopes.find(s=>s.id===scope),fresh=!!net?.current;
 const approved=!!approval&&approval.current&&!approval.returned&&approval.step>=6;
 useEffect(()=>{let active=true;if(!net?.id){setApproval(null);return;}getNormalApproval(net.id).then(a=>{if(active)setApproval(a);}).catch(e=>{if(active)setError('Approval status could not load: '+e.message);});return()=>{active=false;};},[net?.id,revision]);
 useEffect(()=>{let active=true;const controller=new AbortController();setBusy(true);setLoadingSaved(false);setPreflight(null);setError('');
  (async()=>{
   // Start the selected cutoff checks while the small access contexts load.
   // Waiting for contexts first used to add their latency to every refresh.
   const details=scope&&validCutoff(from,to)?Promise.allSettled([
    fetchPreparation(scope,from,to,controller.signal),grossRuns(scope),
    Promise.resolve(supabase.rpc('get_payroll_calculation_preflight',{p_scope:scope,p_from:from,p_to:to})).then(({data,error})=>{if(error)throw new Error(error.message);return data.issues;})
   ]):null;
   const [t,g]=await Promise.all([fetchTimeContext(),grossContext()]);if(!active)return;
   const combined=t.scopes.filter(s=>s.canView).map(s=>({...s,gross:g.scopes.find(x=>x.id===s.id)}));setScopes(combined);
   if(!combined.some(s=>s.id===scope)){setScope(combined[0]?.id||'');return;}if(!validCutoff(from,to))return;
   const [preparation,runResult,checks]=await details!;
   if(!active)return;if(preparation.status==='rejected')throw preparation.reason;
   setReadiness(preparation.value.readiness);setTime(preparation.value.time);
   const canViewGross=!!g.scopes.find(s=>s.id===scope)?.canView;
   if(canViewGross&&runResult.status==='rejected')throw new Error(`Attendance checked, but saved payroll drafts could not load: ${runResult.reason.message}`);
   if(canViewGross&&checks.status==='rejected'){setPreflight(null);throw new Error(`Calculation checks could not load: ${checks.reason.message}`);}setPreflight(checks.status==='fulfilled'?checks.value:[]);
   const runs=runResult.status==='fulfilled'?runResult.value:[];
   const saved=runs.filter(x=>x.from===from&&x.to===to).sort((a,b)=>b.version-a.version)[0];setExisting(saved?.id||'');
   if(saved&&(selection.grossId||params.get('stage')==='calculate')){
    setLoadingSaved(true);
    void (async()=>{const [gr,w]=await Promise.all([getGrossRun(saved.id),netWorkspace(saved.id)]);if(!active)return;
     if(gr.from===from&&gr.to===to){setGross(gr);setFinance(w);setStep(1);const id=w.runs.filter(n=>n.grossId===gr.id).sort((a,b)=>b.version-a.version)[0]?.id;if(id){const nr=await getNetRun(id);if(active)setNet(nr);}}
    })().catch(e=>{if(active)setError(`Saved payroll could not load: ${e.message}`);}).finally(()=>{if(active)setLoadingSaved(false);});
   }
  })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;controller.abort();};
 },[scope,from,to,revision]);
 useEffect(()=>{let active=true;if(!scope||!validCutoff(from,to)||!canImportActualAttendance(user)){setApprovedAttendance(null);return;}
  supabase.rpc('get_actual_attendance_import_reviews',{p_scope:scope,p_from:from,p_to:to}).then(({data,error})=>{
   if(!active||error)return;const selected=new Map<string,{employeeId:string;changed:boolean}>();
   for(const review of (data||[]).filter((item:{status:string})=>item.status==='approved').sort((a:{submitted_at:string},b:{submitted_at:string})=>b.submitted_at.localeCompare(a.submitted_at))){
    for(const change of review.preview?.changes||[]){const key=`${change.employeeId}:${change.workDate}`;if(!selected.has(key))selected.set(key,{employeeId:change.employeeId,changed:change.beforeStatus!==change.afterStatus||JSON.stringify(change.beforeEvents)!==JSON.stringify(change.afterEvents)});}
   }
   setApprovedAttendance({employees:new Set([...selected.values()].map(item=>item.employeeId)).size,days:selected.size,fixes:[...selected.values()].filter(item=>item.changed).length});
  });return()=>{active=false;};
 },[scope,from,to,revision,user?.id]);
 async function openExisting(){setBusy(true);setError('');try{const gr=await getGrossRun(existing);const w=await netWorkspace(gr.id);setFinance(w);const id=w.runs.filter(r=>r.grossId===gr.id).sort((a,b)=>b.version-a.version)[0]?.id;const nr=id?await getNetRun(id):null;setGross(gr);setNet(nr);remember({grossId:gr.id,netId:nr?.id||''});setStep(1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const submitted=time?.packages.find(p=>p.status==='submitted'&&p.current&&!p.blockedDays);
 useEffect(()=>{const refresh=()=>{if(Date.now()-lastFocusRefresh.current<60_000)return;lastFocusRefresh.current=Date.now();setRevision(x=>x+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 const attendanceCanHandover=!!time&&!!unit?.canFinalize&&time.result.totalDays>0&&time.result.blockedDays===0;
 useEffect(()=>{if(error||notice)document.getElementById('payroll-feedback')?.scrollIntoView({behavior:'smooth',block:'center'});},[error,notice]);
 const calculationBlocked=!!unit?.gross?.canCalculate&&(preflight===null||preflight.length>0);
 async function calculate(){if(busy||loadingSaved)return;if(calculationBlocked){setError('Complete the calculation checklist above before calculating payroll.');return;}if(!submitted&&!attendanceCanHandover)return;if(existing&&!gross&&unit?.gross?.canCalculate){setError('Open the existing payroll before choosing to recalculate it.');return;}setBusy(true);setError('');setNotice('');try{
  const packageId=submitted?.id||await prepareAttendance(scope,from,to,time!.sourceHash);
  if(!unit?.gross?.canCalculate){setNotice('Attendance is ready and sent to Finance. Next: Finance calculates payroll and reviews statutory contributions and deductions. Draft payslips and reports become available after take-home pay is calculated.');setRevision(x=>x+1);return;}
  const id=await prepareGross(packageId,'Normal payroll calculation from approved packages and submitted actual timekeeping');const gr=await getGrossRun(id);setGross(gr);setStep(1);remember({grossId:id,netId:''});setNet(null);
  const w=await netWorkspace(id);setFinance(w);
  if(!w.canReview){setNotice('Gross payroll saved. The assigned Finance operator can calculate take-home pay from approved records.');return;}
  const result=await calculateAutomaticPayroll(id);
  if(!result.ready){setFinance({...w,automaticIssues:result.issues});setNotice('Gross payroll saved. Only the missing or conflicting records listed by employee need attention.');return;}
  if(!result.runId)throw new Error('Calculation did not return a saved payroll version. Refresh saved versions before retrying.');
  const nr=await getNetRun(result.runId);setNet(nr);remember({grossId:id,netId:result.runId});setStep(1);setNotice('Payroll calculated successfully using approved records.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function reviewAndCalculate(inputs:NetInputs,ref:string){if(!gross)return;setBusy(true);setNet(null);setError('');setNotice('');try{
  await saveNetReview(gross.id,inputs,ref);const w=await netWorkspace(gross.id);setFinance(w);
  const result=await calculateAutomaticPayroll(gross.id);if(!result.ready){setFinance({...w,automaticIssues:result.issues});setNotice('Review the remaining missing or conflicting records listed by employee.');return;}
  if(!result.runId)throw new Error('Calculation did not return a saved payroll version. Refresh saved versions before retrying.');
  const nr=await getNetRun(result.runId);setNet(nr);remember({grossId:gross.id,netId:result.runId});setStep(2);setNotice('Payroll calculated successfully. Draft outputs are ready.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function saveDraft(){setBusy(true);setError('');try{if(net||gross){setNotice('This calculation is already saved as a persistent draft. No payments or payslips were released.');return;}if(!time||!unit?.canFinalize)throw new Error('Only the assigned HR finalizer can save the timekeeping draft. Your selected business unit and period are retained.');await saveTime(scope,from,to,time.sourceHash,'Saved from Prepare payroll — not submitted');setNotice('Timekeeping draft saved. It has not been submitted for approval or payment.');setRevision(x=>x+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function sendForApproval(){
  if(!net||!fresh)return;
  setBusy(true);setError('');setNotice('');
  try{
   const existingApproval=await getNormalApproval(net.id);
   if(existingApproval){setApproval(existingApproval);navigate('/payroll/approvals?run='+existingApproval.id);return;}
   if(user?.role===Role.FinanceStaff){
    const id=await submitApproval(net.id,null,'Normal payroll · '+net.id,'HR Manager via HRIS payroll approvals');
    setApproval(await getNormalApproval(net.id));
    setNotice('Payroll submitted. HR review starts now; both BODs will be notified after Finance authorization.');
    navigate('/payroll/approvals?run='+id);
   }else{
    const request=await requestNormalApproval(net.id);
    if(request.runId){setApproval(await getNormalApproval(net.id));navigate('/payroll/approvals?run='+request.runId);return;}
    setNotice('Sent to Finance for submission. Finance will review this saved version, then HR and both BODs approve it.');
   }
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 async function exportDraft(kind:'summary'|'breakdown'|'register'|'contributions'|'deductions'|'payslips'){
  if(!net)return;setBusy(true);setError('');try{const current=await getNetRun(net.id);if(!current.current){setNet(current);throw new Error('Source records changed. Recalculate before generating draft documents.');}
   const signed=await getNormalApproval(current.id);
   if(kind!=='summary'&&kind!=='breakdown'&&(!signed||!signed.current||signed.returned||signed.step<6))throw new Error('Payroll outputs become available after all approvals.');
   const outputLabel=signed&&signed.current&&signed.step>=6?'APPROVED REVIEW COPY — NOT RELEASED':'DRAFT — FOR APPROVAL';
   if(kind==='payslips'){
    const {jsPDF}=await import('jspdf');const pdf=new jsPDF();
    current.result.employees.forEach((e,i)=>{if(i)pdf.addPage();pdf.setFontSize(19);pdf.text('APPROVED - NOT RELEASED',20,24);pdf.setFontSize(13);pdf.text(e.employeeName,20,40);pdf.setFontSize(10);pdf.text(`${unit?.name||''} | ${from} to ${to}`,20,49);pdf.text(`Pay date: ${current.payDate}`,20,56);
     const rows=[['Gross pay',e.gross],['Employee deductions',e.deductions],['Take-home pay',e.net],['Withholding tax (included in deductions)',e.tax],['Mandatory deductions (included in deductions)',e.mandatory],...e.loans.map(l=>[`Loan: ${l.account}`,l.amount]),...e.otherDeductions.map(d=>[d.label,d.amount])];
     let y=73;rows.forEach(([label,value])=>{if(y>265){pdf.addPage();y=25;pdf.text('APPROVED - NOT RELEASED (continued)',20,y);y+=14;}const lines=pdf.splitTextToSize(label,115);pdf.text(lines,20,y);pdf.text(`PHP ${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`,190,y,{align:'right'});y+=Math.max(10,lines.length*5+4);});
     pdf.setFontSize(9);pdf.text('Approved review copy. Payment and employee release are separate actions.',20,285);
    });pdf.save(`APPROVED-payslips-${from}-${to}.pdf`);return;
   }
   const rows:string[][]=[[outputLabel],['Business unit',unit?.name||''],['Cutoff',from,to],['Pay date',current.payDate]];
   if(kind==='summary'){rows.push(['Employees',String(current.result.employees.length)],['Total gross',current.result.gross],['Total deductions',current.result.deductions],['Total net',current.result.net],['Employer contributions',current.result.employer],['Total company cost',current.result.employerTotalCost||String(Number(current.result.gross)+Number(current.result.employer))],[],['Employee','Gross','Deductions','Net','Employer contributions','Company cost']);current.result.employees.forEach(e=>rows.push([e.employeeName,e.gross,e.deductions,e.net,e.employer,e.employerTotalCost||String(Number(e.gross)+Number(e.employer))]));}
   if(kind==='breakdown'){rows.push(['Employee','Category','Item','Amount','Basis']);current.result.employees.forEach(e=>{const grossEmployee=gross?.result.employees.find(g=>g.employeeId===e.employeeId);grossEmployee?.lines.forEach(l=>rows.push([e.employeeName,'Earnings',l.label,l.amount,l.date||'']));e.contributions.forEach(c=>rows.push([e.employeeName,'Government contribution',c.label,c.amount,'Monthly '+c.monthly+'; previous '+c.prior]));rows.push([e.employeeName,'Withholding tax','Tax',e.tax,'']);e.loans.forEach(l=>rows.push([e.employeeName,'Loan',l.account,l.amount,l.sourceRef]));e.otherDeductions.forEach(d=>rows.push([e.employeeName,'Other deduction',d.label,d.amount,d.sourceRef]));rows.push([e.employeeName,'Final','Gross',e.gross,''],[e.employeeName,'Final','Total deductions',e.deductions,''],[e.employeeName,'Final','Net',e.net,''],[e.employeeName,'Final','Employer contributions',e.employer,''],[e.employeeName,'Final','Company cost',e.employerTotalCost||String(Number(e.gross)+Number(e.employer)),'']);});}
   if(kind==='register'){rows.push(['Employee','Gross','Deductions','Net','Employer contributions']);current.result.employees.forEach(e=>rows.push([e.employeeName,e.gross,e.deductions,e.net,e.employer]));}
   if(kind==='contributions'){rows.push(['Employee','Contribution','Monthly due','Previous cutoff','This cutoff']);current.result.employees.forEach(e=>e.contributions.forEach(c=>rows.push([e.employeeName,c.label,c.monthly,c.prior,c.amount])));}
   if(kind==='deductions'){rows.push(['Employee','Deduction','Amount','Source reference']);current.result.employees.forEach(e=>{e.loans.forEach(l=>rows.push([e.employeeName,l.account,l.amount,l.sourceRef]));e.otherDeductions.forEach(d=>rows.push([e.employeeName,d.label,d.amount,d.sourceRef]));});}
   downloadText(`${outputLabel.startsWith('APPROVED')?'APPROVED':'DRAFT'}-${kind}-${from}-${to}.csv`,rows.map(r=>r.map(v=>`"${(/^[=+@-]/.test(v)?"'":'')+v.replaceAll('"','""')}"`).join(',')).join('\r\n'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const people=new Map<string,{name:string;issues:{date:string;message:string}[]}>();time?.result.rows.forEach(r=>{if(!people.has(r.employeeId))people.set(r.employeeId,{name:r.employeeName,issues:[]});r.issues.forEach(message=>people.get(r.employeeId)!.issues.push({date:r.date,message}));});
 const pendingEmployees=[...people.values()].filter(p=>p.issues.length).length;
 const titles=['Run Payroll','Review payroll','Approved payroll outputs'];
 return <main className="min-h-screen bg-violet-50/40 p-4 pb-28 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-7 sm:pb-28">
  <header className="mb-6 flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{titles[step]}</h1><p className="mt-2 text-slate-500">{step===0?'Select your business unit and payroll period. Existing approved records load automatically.':step===1?'Review the amounts, fix issues, then generate.':'Draft documents do not release payments or publish payslips.'}</p></div><span className={`rounded-full px-4 py-2 text-sm font-semibold ${net&&!fresh?'bg-amber-100 text-amber-900':'bg-violet-100 text-violet-800'}`}>{net?fresh?'Calculated draft':'Needs recalculation':gross?'Gross calculated · Finance review needed':'Draft'}</span></header>
  <div className="mb-5 grid gap-4 lg:grid-cols-2"><label className="text-sm font-semibold">Business unit<select aria-label="Business unit" disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3 dark:bg-slate-900" value={scope} onChange={e=>setScope(e.target.value)}><option value="">Choose business unit</option>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><NormalPayrollPeriodSelector disabled={busy} onPeriod={setCycle}/></div>
  <Link to="/payroll/ready" className={`${button} mb-5`}>Ready for Payroll · Finance inbox →</Link>
  <nav aria-label="Payroll steps" className="mb-6 flex gap-3">{['Prepare','Review & submit','Approved outputs'].map((label,i)=><button key={label} disabled={i>0&&!gross||i===2&&!approved} onClick={()=>setStep(i)} aria-current={step===i?'step':undefined} className={`flex-1 rounded-xl border p-3 text-sm font-semibold disabled:opacity-40 ${step===i?'border-violet-600 bg-violet-600 text-white':'bg-white dark:bg-slate-900'}`}>{i+1}. {label}</button>)}</nav>

  <section id="payroll-feedback" aria-live="polite" className="mb-4 scroll-mt-24">{busy&&<p role="status">Checking this payroll cutoff…</p>}{loadingSaved&&<p role="status">Opening saved payroll amounts…</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-blue-900">{notice}</p>}</section>
  {step===0&&unit?.gross?.canView&&<section className={`${panel} mb-5`}><h2 className="text-xl font-bold">{preflight?.length?'Attendance detail to resolve':'Ready to calculate'}</h2><p className="mt-3">Pay comes from the approved package, including recurring benefits. Workdays, rest days and payable hours come from your saved schedules and approved attendance. Philippine overtime, holiday and night differential rates are applied automatically.</p>{preflight===null?<p className="mt-3">{busy?'Checking saved attendance and approved pay packages…':'Checks unavailable. Refresh readiness to retry.'}</p>:preflight.length?<><ul className="mt-3 list-disc space-y-2 pl-5">{preflight.map((issue,i)=><li key={i}>{issue.message}</li>)}</ul>{preflight.some(i=>i.code==='package')&&<Link to="/payroll/pay-packages" className={`${button} mt-3`}>Review pay packages</Link>}{preflight.some(i=>i.code==='attendance_details')&&<Link to="/payroll/overtime-requests" className={`${button} mt-3`}>Review approved OT details</Link>}</>:<p className="mt-3 text-emerald-700">Ready. No separate salary confirmation or employee setup is needed.</p>}<details className="mt-3 text-sm text-slate-500"><summary className="cursor-pointer">Calculation basis</summary><p className="mt-2">The package effective on each work date is used. Monthly-paid packages default to half the monthly amount per full cutoff, including paid rest days and holidays, with an hourly conversion of monthly base × 12 ÷ 365 ÷ 8. Existing approved company or employee calculation rules take precedence. Night differential applies from 10 PM to 6 AM. A shortened final OT approval is counted from its recorded start; it does not need another approval.</p></details></section>}
  {existing&&!gross&&<div className={`${panel} mb-5 flex flex-wrap items-center justify-between gap-3`}><p>A payroll calculation already exists for this cutoff.</p><button className={button} disabled={busy||loadingSaved} onClick={()=>void openExisting()}>{loadingSaved?'Opening saved payroll…':'Open existing payroll'}</button></div>}
  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-4">
  {step===0&&params.get('stage')==='calculate'&&<section className={panel}><h2 className="text-xl font-bold">Calculate payroll</h2><p className="my-3">{submitted?'Attendance is submitted. Calculate gross pay, review deductions, then generate payslips and reports here.':'Attendance must be submitted before calculation.'}</p><button className={`${button} bg-violet-600 !text-white`} disabled={busy||loadingSaved||!submitted||!unit?.gross?.canCalculate||calculationBlocked} onClick={()=>void calculate()}>{busy||loadingSaved?'Opening payroll…':calculationBlocked?'Complete the checklist above':'Calculate Payroll'}</button>{!busy&&!unit?.gross?.canCalculate&&<p className="mt-3">Calculation is available to Admin/BOD and the assigned Finance operator. Draft processing must also be enabled for this business unit.</p>}</section>}
  {step===0&&unit?.gross?.canManage&&unit.gross.mode==='off'&&<button className={button} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await setShadow(scope,true,'Enable draft calculation for this business unit from Run Payroll');setRevision(v=>v+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Enable draft calculation for this business unit</button>}
  {step===0&&params.get('stage')!=='calculate'&&<>
   <ReadinessCard title="1. Schedules" status={readiness?`${readiness.publishedDays} of ${readiness.totalDays} employee-days published`:busy?'Checking schedules…':error?'Schedule check could not finish — refresh readiness':'Schedules not checked'} ready={!!readiness&&readiness.totalDays>0&&readiness.publishedDays===readiness.totalDays}><Link className={button} to={`/payroll/timekeeping?week=${from}&source=payroll&businessUnit=${encodeURIComponent(unit?.name||'')}`}>Open Schedule Builder</Link><Link className={button} to="/payroll/import/schedules">Import schedules</Link></ReadinessCard>
   <ReadinessCard title="2. Attendance" status={time?pendingEmployees?`${pendingEmployees} employees need review`:`${people.size} employees ready for timekeeping review`:'Attendance readiness not yet checked'} ready={!!time&&!pendingEmployees&&people.size>0}>{approvedAttendance&&approvedAttendance.days>0&&<p className="w-full text-sm">Approved import: {approvedAttendance.employees} employees · {approvedAttendance.days} selected day rows · {approvedAttendance.fixes} audited changes</p>}{canImportActualAttendance(user)&&<><Link className={`${button} bg-violet-600 !text-white`} to="/payroll/import-attendance">Import attendance</Link><Link className={button} to="/payroll/import-attendance">Enter manually</Link></>}<Link className={button} to="/payroll/attendance-readiness">Review & finalize timekeeping</Link></ReadinessCard>
   {canImportActualAttendance(user)&&scope&&validCutoff(from,to)&&<RecordedBreakApprovals scope={scope} from={from} to={to} onApplied={()=>setRevision(x=>x+1)}/>}
   {canImportActualAttendance(user)&&scope&&validCutoff(from,to)&&<section id="payroll-attendance-approvals" className="scroll-mt-24"><AttendanceImportApprovals scope={scope} from={from} to={to} onApplied={()=>setRevision(x=>x+1)} key={`${scope}:${from}:${to}:${revision}`}/></section>}
   <ReadinessCard title="3. Pay packages" status={readiness?.payVisible?`${readiness.reviewedPayEmployees} of ${readiness.employees} employees have approved base-pay coverage`:readiness?'Package readiness requires compensation access':busy?'Checking pay packages…':'Pay-package readiness not checked'} ready={!!readiness?.payVisible&&readiness.employees>0&&readiness.reviewedPayEmployees===readiness.employees}><Link className={button} to="/payroll/pay-packages">View packages</Link></ReadinessCard>
   <details className={panel}><summary className="cursor-pointer text-lg font-bold">Additional records, if needed</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['Import leave opening balances','/payroll/import/leave-balances'],['Add or import leave taken','/payroll/import/leave-taken'],['Loans and authorized deductions','/payroll/import/deductions'],['Allowances and reimbursements','/payroll/import/additions'],['Service-charge allocations','/payroll/import/service-charge']].map(([label,path])=><Link className={button} key={label} to={path}>{label}</Link>)}</div></details>
  </>}
  {step>0&&<>
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Employees included',net?.result.employees.length??gross?.result.employees.length,false],['Employees with issues',new Set([...people.entries()].filter(([,p])=>p.issues.length).map(([id])=>id).concat((finance?.automaticIssues||[]).map(e=>e.employeeId))).size,false],['Total gross pay',net?.result.gross||gross?.result.gross,true],['Total deductions',net?.result.deductions,true],['Total net pay',net?.result.net,true],['Total employer contributions',net?.result.employer,true],['Total company cost',net?.result.employerTotalCost||(net?String(Number(net.result.gross)+Number(net.result.employer)):undefined),true]].map(([label,value,currency])=><div className={panel} key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold">{value!==undefined?(currency?peso(value as string|number):value):'Calculation pending'}</p></div>)}</div>
   {!net&&<section className={panel}><h2 className="font-bold">Review payroll & calculate</h2><p className="my-3 text-sm">Approved pay packages and attendance are loaded. Saved Finance figures stay filled in; only missing records or changes need entry.</p><p className="text-sm">No workbook is required. Review the status below, then calculate take-home pay.</p></section>}
   {!!finance?.automaticNotices?.length&&<section className={panel}><h2 className="text-lg font-bold">Recorded follow-up</h2><p className="mt-2 text-sm">These notes do not stop draft payroll calculation. Government identifiers must be entered in the employee profiles before remittance.</p><div className="mt-3 space-y-2 text-sm">{['prior_contributions','tax_history','variable_month_basis','employee_ids'].map(code=>{const matching=finance.automaticNotices?.filter(n=>n.code===code)||[];return matching.length?<details key={code}><summary className="cursor-pointer font-medium">{code==='prior_contributions'?'Earlier cutoff assumed settled':code==='tax_history'?'Annual tax reconciliation':code==='variable_month_basis'?'Projected monthly basis':'HR Manager: update government IDs'} · {matching.length} employees</summary><ul className="mt-2 list-disc space-y-1 pl-5">{matching.map(n=><li key={n.employeeId+n.code}>{n.employeeName}: {n.message}</li>)}</ul></details>:null;})}</div></section>}
   {(!net||!fresh)&&!!finance?.automaticIssues?.length&&<section className={panel}><h2 className="text-xl font-bold">Needs attention · {finance.automaticIssues.length} employees</h2><div className="mt-3 space-y-4">{finance.automaticIssues.map(e=><div key={e.employeeId}><strong>{e.employeeName}</strong><ul className="mt-2 list-disc space-y-1 pl-5">{e.items.map(i=><li key={i.code+i.message}>{i.message}</li>)}</ul></div>)}</div></section>}
   {(!net||!fresh)&&finance?.canReview&&<div id="payroll-finance-review" className="scroll-mt-6"><ReviewForm key={`${finance.gross.id}:${finance.review?.id||'new'}`} w={finance} busy={busy} onWorking={setBusy} save={reviewAndCalculate} submitLabel="Save review & calculate payroll"/></div>}
   {net&&!fresh&&<p role="alert" className="rounded-xl bg-amber-100 p-4 text-amber-900">Needs recalculation. {net.staleReason} Draft generation and approval are disabled until current sources are calculated.</p>}
   <section className={panel}><div className="mb-4 flex justify-between gap-3"><h2 className="font-bold">{net?.result.employees.length||gross?.result.employees.length||0} employees</h2><label className="text-sm"><input type="checkbox" checked={onlyIssues} onChange={e=>setOnlyIssues(e.target.checked)}/> Show issues only</label></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-violet-50 dark:bg-slate-800"><tr>{['Employee','Attendance','Gross','Deductions','Net','Company cost','Action'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{(net?.result.employees||gross?.result.employees||[]).filter(e=>!onlyIssues||people.get(e.employeeId)?.issues.length||finance?.automaticIssues?.some(i=>i.employeeId===e.employeeId)).map(e=>{const n=net?.result.employees.find(x=>x.employeeId===e.employeeId),issues=people.get(e.employeeId)?.issues||[];return <tr className="border-t" key={e.employeeId}><td className="p-3 font-medium">{e.employeeName}<p className="text-sm text-slate-500">{unit?.name}</p>{finance?.packageTerms?.find(t=>t.employeeId===e.employeeId)?.packages.map(p=><p key={p.id} className="text-sm font-normal">Approved package · {peso(p.baseAmount)} {p.rateType.toLowerCase()} · Effective {p.effectiveFrom}</p>)}</td><td className="p-3">{issues.length?`${issues.length} issues`:time?'Ready':'Not checked'}</td><td className="p-3">{peso(e.gross)}</td><td className="p-3">{n?peso(n.deductions):'Review needed'}</td><td className="p-3">{n?peso(n.net):'Review needed'}</td><td className="p-3">{n?peso(n.employerTotalCost||String(Number(n.gross)+Number(n.employer))):'Calculation pending'}</td><td className="p-3"><button aria-haspopup="dialog" className="text-violet-600" onClick={()=>setEmployee(e.employeeId===employee?'':e.employeeId)}>View breakdown</button></td></tr>;})}</tbody></table></div></section>
   {employee&&gross&&<Modal isOpen onClose={()=>setEmployee('')} title="Payroll calculation details" size="full" viewportFit><PayrollBreakdown key={`${gross.id}:${employee}`} gross={gross} employeeId={employee} unitName={unit?.name||''} netEmployee={net?.result.employees.find(e=>e.employeeId===employee)} netCurrent={net?.current} issues={people.get(employee)?.issues} busy={busy} canRecalculate={!!unit?.gross?.canCalculate&&!calculationBlocked} onRecalculate={()=>{setEmployee('');void calculate();}} onReview={()=>{setEmployee('');setStep(1);requestAnimationFrame(()=>document.getElementById('payroll-finance-review')?.scrollIntoView({behavior:'smooth',block:'start'}));}} sources={sources}/></Modal>}
   {net&&<section className={panel}><h2 className="font-bold">Employer cost</h2><p className="mt-3">Gross employee compensation: {peso(net.result.gross)}</p><p>Employer statutory contributions: {peso(net.result.employer)}</p><p className="mt-3 text-lg font-bold">Total company payroll cost: {peso(net.result.employerTotalCost||String(Number(net.result.gross)+Number(net.result.employer)))}</p><p className="mt-2 text-sm text-slate-500">Employee deductions reduce take-home pay, not employer cost.</p></section>}
  </>}
  </div><aside className="space-y-4"><section className={panel}><h2 className="text-xl font-bold">This payroll</h2><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><dt>Pay date</dt><dd>{cycle?formatPayrollDate(cycle.releaseDate):'Confirm payroll calendar'}</dd></div><div className="flex justify-between gap-3"><dt>Cutoff</dt><dd>{from}–{to}</dd></div><div className="flex justify-between"><dt>Time zone</dt><dd>Asia/Manila</dd></div><div className="flex justify-between"><dt>Employee group</dt><dd>Employee payroll</dd></div><div className="flex justify-between"><dt>Employees</dt><dd>{readiness?.employees??'Not checked'}</dd></div></dl><button className={`${button} mt-5`} disabled={busy} onClick={()=>setRevision(x=>x+1)}>Refresh readiness</button></section>
   {<section className={panel}><h2 className="text-xl font-bold">Payroll files</h2><p className="my-3 text-sm text-slate-500">{approved?'All approvals are complete. These are approved review copies; payment and employee payslip release remain separate.':'Download the summary and employee breakdown for approval. Final payroll files unlock after HR, Finance and both BOD approvals.'}</p><button className={`${button} w-full`} disabled={busy||!fresh} onClick={()=>void exportDraft('summary')}>Download payroll summary & employee totals</button><button className={`${button} mt-3 w-full`} disabled={busy||!fresh} onClick={()=>void exportDraft('breakdown')}>Download employee payroll breakdown</button>{approved&&[['register','Payroll register'],['payslips','Approved payslips (not released)'],['contributions','Government contribution report'],['deductions','Loan & deduction schedule']].map(([kind,label])=><button className={`${button} mt-3 w-full`} disabled={busy} key={kind} onClick={()=>void exportDraft(kind as 'register'|'payslips'|'contributions'|'deductions')}>{label}</button>)}</section>}
   {scope&&<PreviousPaymentCard scope={scope} from={from} to={to} net={net?.result.net}/>}
   {step===0&&<section className={`${panel} text-sm`}><h2 className="font-bold">{submitted?'Attendance sent to Finance':'Next: send attendance to Finance'}</h2><ol className="mt-3 list-decimal space-y-3 pl-5"><li>{submitted?'Attendance received — handover complete.':'Send the completed attendance using the button below.'}</li><li>Finance calculates gross pay and reviews contributions, tax and deductions.</li><li>Calculate take-home pay to unlock draft payslips, the payroll summary, employee breakdowns and government-contribution reports.</li></ol><p className="mt-3">Government-contribution downloads are breakdowns; they do not submit government filings.</p></section>}
  </aside></div>
  <footer aria-label="Payroll actions" className="mt-6 space-y-4 rounded-2xl border bg-white p-5 pr-24 dark:bg-slate-900">
   {error&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800"><p>{error}</p>{/pay differs|pay.package/i.test(error)&&<Link className="mt-2 inline-flex min-h-11 items-center font-semibold underline" to="/payroll/pay-packages">Review the employee’s approved pay package →</Link>}{/attendance fixes.*approval/i.test(error)&&<a className="mt-2 inline-flex min-h-11 items-center font-semibold underline" href="#payroll-attendance-approvals">Review pending attendance approvals ↑</a>}</div>}
   {notice&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-blue-900">{notice}</p>}
   {busy&&<p role="status">Please wait — checking or saving payroll records…</p>}
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Saving or submitting does not release payment.</p><div className="flex flex-wrap gap-3"><button className={button} disabled={busy||loadingSaved} onClick={()=>void saveDraft()}>Save draft</button>{fresh?(approved?<button className={`${button} bg-violet-600 !text-white`} disabled={busy} onClick={()=>setStep(2)}>View approved outputs</button>:approval?<Link className={`${button} bg-violet-600 !text-white`} to={'/payroll/approvals?run='+approval.id}>View approval progress</Link>:<button className={`${button} bg-violet-600 !text-white`} disabled={busy} onClick={()=>void sendForApproval()}>{user?.role===Role.FinanceStaff?'Submit payroll for approval':'Send payroll to Finance for approval'}</button>):<button className={`${button} bg-violet-600 !text-white`} disabled={busy||loadingSaved||calculationBlocked||(!submitted&&!attendanceCanHandover)||(!unit?.gross?.canCalculate&&(!!submitted||!attendanceCanHandover))} onClick={()=>void calculate()}>{busy||loadingSaved?'Please wait…':!unit?.gross?.canCalculate?(submitted?'Attendance sent to Finance':'Send ready attendance to Finance'):gross?'Recalculate draft payroll':'Calculate Payroll'}</button>}</div></div></footer>
 </main>;
}
function ReadinessCard({title,status,ready,children}:{title:string;status:string;ready:boolean;children:React.ReactNode}){return <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}><div><h2 className="text-xl font-bold">{title}</h2><p className={`mt-2 font-medium ${ready?'text-emerald-700':'text-amber-700'}`}>{status}</p></div><div className="flex flex-wrap gap-2">{children}</div></section>;}

import React,{useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {useAttendanceClock} from '../../hooks/useAttendanceClock';
import {AttendanceMissionView} from './AttendanceMission';
import {captureGps,Channels,getChannels} from '../../services/attendanceChannels';
import Modal from '../ui/Modal';
import MissedPunchModal from './MissedPunchModal';
import AttendanceReminders from './AttendanceReminders';
import {needsOtPrompt,shiftBounds} from '../../services/attendanceExperience';
import {useAuth} from '../../hooks/useAuth';
import AttendanceHistory from './AttendanceHistory';
import {getMyAttendanceHistory,AttendanceHistory as History,getMyAttendance} from '../../services/employeeAttendance';
import type {AttendanceDay,ClockAction} from '../../services/employeeAttendance';
export default function AttendanceClock(){
 const navigate=useNavigate();const [missed,setMissed]=useState<ClockAction|null>(null);const [otDay,setOtDay]=useState<AttendanceDay|null>(null);
 const c=useAttendanceClock();const location=useLocation();const [channels,setChannels]=useState<Channels|null>(null);const [method,setMethod]=useState('web');const [site,setSite]=useState('');const [token,setToken]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const preparing=useRef(false);
 useEffect(()=>{let active=true;getChannels().then(v=>{if(!active)return;setChannels(v);setSite(v.sites[0]?.id??'');const scanned=new URLSearchParams(location.hash.slice(1)).get('kiosk');setToken(scanned??'');setMethod(scanned&&v.config.qr_enabled?'qr':v.config.web_allowed?'web':v.config.gps_enabled?'gps':'qr');}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[location.hash]);
 const act=async(action:ClockAction)=>{if(preparing.current||!channels)return false;preparing.current=true;setBusy(true);setError('');try{const evidence=method==='gps'?await captureGps(site):method==='qr'?{method:'qr' as const,token:token.trim()}:{method:'web' as const};return await c.act(action,evidence);}catch(e){setError((e as Error).message);return false;}finally{preparing.current=false;setBusy(false);}};
 const requestAction=async(action:ClockAction)=>{if(action!=='CLOCK_OUT'){await act(action);return;}if(busy||c.busy)return;setBusy(true);try{const latest=await getMyAttendance();if(needsOtPrompt(latest)){setOtDay(latest);return;}}catch(e){setError((e as Error).message);return;}finally{setBusy(false);}await act(action);};
 const finish=async(apply:boolean)=>{const scheduled=otDay?shiftBounds(otDay):null;const result=await act('CLOCK_OUT');if(!result)return;setOtDay(null);if(apply&&scheduled){const out=result.events.find(e=>e.type==='CLOCK_OUT');if(!out){setError('Clock-out saved. Open Overtime Requests to review your actual times.');return;}const manila=(stamp:number)=>new Date(stamp+8*3600000).toISOString();navigate('/payroll/overtime-requests',{state:{openNewOTModal:true,attendanceOt:{date:manila(scheduled.end).slice(0,10),startTime:manila(scheduled.end).slice(11,16),endTime:manila(Date.parse(out.timestamp)).slice(11,16)}}});}};
 const {user}=useAuth();
 const [help,setHelp]=useState(new URLSearchParams(location.search).has('help')),[helpChoice,setHelpChoice]=useState(''),[showHistory,setShowHistory]=useState(false),[correction,setCorrection]=useState(false);
 const [history,setHistory]=useState<History|null>(null),[historyError,setHistoryError]=useState('');
 const calendarDay=c.day?new Date(Date.parse(c.day.serverTime)+8*3600000).toISOString().slice(0,10):'';
 useEffect(()=>{let active=true;let generation=0;setHistory(null);setHistoryError('');
 const load=async()=>{const n=++generation;try{const d=await getMyAttendanceHistory();if(active&&n===generation){setHistory(d);setHistoryError('');}}catch(e){if(active&&n===generation)setHistoryError((e as Error).message);}};
 if(user?.id&&calendarDay)void load();
 const changed=()=>{if(user?.id&&calendarDay)void load();};window.addEventListener('attendance-updated',changed);
 return()=>{active=false;window.removeEventListener('attendance-updated',changed);};},[user?.id,calendarDay]);
 const openHelp=()=>{setHelpChoice('');setHelp(true);};
 const eligible=c.day?.requiresClock&&c.day.state!=='completed';
 return <>
 <AttendanceMissionView day={c.day} elapsed={c.elapsed} busy={busy||c.busy||c.loading||!channels} error={error||c.error} onAction={a=>void requestAction(a)} onRefresh={()=>void c.refresh()} onHelp={openHelp} onAbsence={()=>navigate('/payroll/attendance-requests?new=1&today=1')} onHistory={()=>setShowHistory(true)} history={history} historyError={historyError}/>
 <Modal isOpen={help} viewportFit onClose={()=>setHelp(false)} title="Attendance Help" size="md"><div className="space-y-3 p-4">
 {helpChoice&&<button className="min-h-11 underline" onClick={()=>setHelpChoice('')}>← All help options</button>}
 {!helpChoice&&<>{[
 ['missed','Missed punch','Forgotten clock-in, clock-out, or break punches.'],
 ['incorrect','Incorrect attendance record','Incorrect times, duplicate punches, wrong location, or other data problems.'],
 ['device','Unable to record attendance','Device, internet, biometric, or location issues.'],
 ['requests','My attendance requests','View pending, returned, approved, rejected, or completed requests.']
 ].map(([id,title,description])=><button key={id} className="block min-h-16 w-full rounded-xl border border-slate-300 p-3 text-left hover:border-violet-400 dark:border-slate-600" onClick={()=>{if(id==='missed'||id==='incorrect'){setCorrection(id==='incorrect');setHelp(false);setMissed(c.day?.state==='not_started'?'CLOCK_IN':'CLOCK_OUT');}else setHelpChoice(id);}}><strong>{title}</strong><span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{description}</span></button>)}</>}
 {helpChoice==='requests'&&<><Link onClick={()=>setHelp(false)} className="block min-h-11 underline" to="/payroll/attendance-requests?queue=own">Attendance reports and returned requests</Link><Link onClick={()=>setHelp(false)} className="block min-h-11 underline" to="/payroll/missed-punches?own=1">Punch corrections and completed requests</Link></>}
 {helpChoice==='device'&&<><p>Check your connection and permitted clock method in Attendance settings. For GPS, enable location access and select your work site. For a kiosk, scan its current QR code.</p><button className="min-h-11 underline" onClick={()=>{setHelp(false);document.getElementById("clock-method-settings")?.setAttribute("open", "");document.getElementById("clock-method-settings")?.scrollIntoView({block:"center"});}}>Open clock method settings</button><p>If a punch was not recorded, submit its actual time for review.</p><button className="min-h-11 underline" onClick={()=>{setHelp(false);setCorrection(false);setMissed(c.day?.state==='not_started'?'CLOCK_IN':'CLOCK_OUT');}}>Report the unrecorded punch</button><Link onClick={()=>setHelp(false)} className="block min-h-11 underline" to="/helpdesk/tickets" state={{openNewTicketModal:true}}>Get technical help</Link></>}
 </div></Modal>
 {showHistory&&<AttendanceHistory onClose={()=>setShowHistory(false)}/>}
 {channels&&eligible&&<details id="clock-method-settings" className="mb-4 rounded-xl border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-semibold">Attendance settings · clock method</summary><div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"><label className="text-sm font-semibold">Clock method<select disabled={busy||c.busy} value={method} onChange={e=>{setMethod(e.target.value);setError('');}} className="ml-3 min-h-12 rounded-lg border bg-transparent px-3 dark:bg-slate-800">{channels.config.web_allowed&&<option value="web">Web / mobile clock</option>}{channels.config.gps_enabled&&<option value="gps">GPS at work site</option>}{channels.config.qr_enabled&&<option value="qr">Scan kiosk QR</option>}</select></label>{method==='gps'&&<label className="text-sm">Work site<select className="ml-2 min-h-12 rounded-lg border bg-transparent px-3 dark:bg-slate-800" value={site} onChange={e=>setSite(e.target.value)}>{channels.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{method==='qr'&&<div className="text-sm"><p>{token?'Kiosk code received. Choose your clock action above.':'Sign in on your phone, then scan the displayed kiosk QR with your phone camera.'}</p><label>Scanned code<input autoComplete="off" className="ml-2 min-h-12 rounded-lg border bg-transparent px-3" value={token} onChange={e=>setToken(e.target.value.trim())} placeholder="QR token"/></label></div>}</div></details>}
 <AttendanceReminders day={c.day}/>
 {missed&&c.day&&<MissedPunchModal date={c.day.workDate} initial={missed} correction={correction} onClose={()=>setMissed(null)}/>}
 <Modal isOpen={!!otDay} onClose={()=>{if(!busy&&!c.busy)setOtDay(null);}} title="Finishing later today?" size="md"><div className="space-y-4 p-4"><p>You are clocking out after your scheduled shift. Do you need to log this extra time as Overtime?</p><p className="text-sm">Your clock-out will be saved before opening the OT form.</p>{(error||c.error)&&<p role="alert" className="text-red-600">{error||c.error}</p>}<button disabled={busy||c.busy} className="min-h-14 w-full rounded-xl bg-violet-600 px-4 font-semibold text-white" onClick={()=>void finish(true)}>Apply for OT Approval</button><button disabled={busy||c.busy} className="min-h-14 w-full rounded-xl border px-4" onClick={()=>void finish(false)}>No, just clocking out</button></div></Modal>
 </>;
}

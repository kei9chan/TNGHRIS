import React,{useEffect,useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {bindPhoneOwner,canInstall,currentPhoneDevice,defaultPhonePreferences,disablePhone,enablePhone,installHris,isHomeScreen,isIPhone,phoneConfiguration,pushSupported,savePhonePreferences,testPhone} from '../../services/phonePushService';
import type {PhoneDevice,PhonePreferences} from '../../services/phonePushService';
import HrisInstallGuide from './HrisInstallGuide';

// Mounted in the authenticated layout. Never requests notification permission automatically.
export function PhoneAccountBinding(){
  const {user}=useAuth();
  useEffect(()=>{if(user?.id) void bindPhoneOwner(user.id).catch(()=>{});},[user?.id]);return null;
}
const labels:Record<keyof PhonePreferences,string>={assignments:'New tasks and checklists',reminders:'Due, overdue and snooze reminders',coverage:'Uncovered tasks and maintenance alerts'};
export default function PhoneNotificationSetup(){
  const {user}=useAuth();
  const [configuration,setConfiguration]=useState<{enabled:boolean;public_key:string}|null>(null);
  const [device,setDevice]=useState<PhoneDevice|null>(null),[preferences,setPreferences]=useState(defaultPhonePreferences);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[installed,setInstalled]=useState(isHomeScreen),[installAvailable,setInstallAvailable]=useState(canInstall);
  const [instructions,setInstructions]=useState(false),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    Promise.all([phoneConfiguration(),currentPhoneDevice()]).then(([config,current])=>{if(!cancelled){setConfiguration(config);setDevice(current);if(current)setPreferences(current.preferences);}}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    const changed=()=>{setInstalled(isHomeScreen());setInstallAvailable(canInstall());};window.addEventListener('hris-install-change',changed);window.addEventListener('pageshow',changed);
    return()=>{cancelled=true;window.removeEventListener('hris-install-change',changed);window.removeEventListener('pageshow',changed);};
  },[user?.id]);
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await fn();}catch(e:any){setError(e.message || 'Phone setup could not be completed');}finally{setBusy(false);}};
  const active=Boolean(device?.active && pushSupported() && Notification.permission==='granted');
  const mustInstall=isIPhone()&&!installed;
  const button='rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50';
  return <section aria-label="Phone notifications and installation" className="my-4 rounded-2xl border border-purple-100 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-800">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">TNG HRIS on your phone</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Add HRIS to your home screen and receive task alerts, even when HRIS is closed.</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-700">{active?'Notifications enabled':installed?'Home-screen app':'No app store needed'}</span></div>
    <div className="mt-4 flex flex-wrap gap-2">
      {!installed&&<button className={`${button} bg-purple-600 text-white`} disabled={busy} aria-expanded={instructions||mustInstall} onClick={()=>void action(async()=>{if(installAvailable&&!isIPhone()){const accepted=await installHris();setMessage(accepted?'HRIS added. Open its icon from your home screen.':'Installation dismissed. You can try again from your browser menu.');}else setInstructions(true);})}>{isIPhone()?'iPhone installation steps':installAvailable?'Install HRIS':'Add to Home Screen'}</button>}
      {!active&&<button className={`${button} bg-purple-100 text-purple-800`} disabled={busy||loading||!configuration?.enabled||mustInstall||!pushSupported()} onClick={()=>void action(async()=>{if(!user || !configuration)return;const current=await enablePhone(user.id,configuration.public_key,preferences);setDevice(current);setMessage('Notifications enabled on this device. Send a test alert to check delivery.');})}>Enable phone notifications</button>}
      {active&&<><button className={`${button} bg-purple-600 text-white`} disabled={busy} onClick={()=>void action(async()=>{const result=await testPhone(device!.id);setMessage(result.message);})}>Send test notification</button><button className={`${button} border border-slate-200 text-slate-700 dark:text-white`} disabled={busy} onClick={()=>void action(async()=>{await disablePhone();setDevice(null);setMessage('Phone notifications disabled on this device.');})}>Disable on this device</button></>}
      <button className={`${button} text-purple-700 underline`} disabled={busy||loading} onClick={()=>void action(async()=>{const current=await currentPhoneDevice();setDevice(current);if(current)setPreferences(current.preferences);setMessage(current?.last_test?.displayed_at?'Test notification displayed on this device.':current?.last_test?.accepted_at?'Provider accepted the test. Check your lock screen or notification center.':'Device status refreshed.');})}>Check notification status</button>
    </div>
    {(instructions||mustInstall)&&<div className="mt-3 rounded-xl bg-purple-50 p-3 dark:bg-slate-900"><HrisInstallGuide/></div>}
    {!pushSupported()&&!mustInstall&&<p className="mt-3 text-sm text-slate-600">Phone notifications are unavailable in this browser. Try updated Chrome on Android, or the home-screen HRIS app on iPhone.</p>}
    {configuration&&!configuration.enabled&&<p className="mt-3 text-sm text-slate-600">Phone notification delivery is being configured. Home-screen installation is available.</p>}
    {active&&<fieldset disabled={busy} className="mt-4"><legend className="text-sm font-medium text-slate-800 dark:text-white">Alerts on this device</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{(Object.keys(labels) as (keyof PhonePreferences)[]).map(key=><label key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={preferences[key]} onChange={event=>setPreferences(p=>({...p,[key]:event.target.checked}))}/>{labels[key]}</label>)}</div><button className={`${button} mt-3 border border-purple-200 text-purple-700`} onClick={()=>void action(async()=>{setDevice(await savePhonePreferences(preferences));setMessage('Your notification preferences are saved.');})}>Save notification preferences</button></fieldset>}
    {device?.last_displayed_at&&<p className="mt-3 text-xs text-slate-500">Last alert displayed: {new Date(device.last_displayed_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>}
    {busy&&<p role="status" className="mt-3 text-sm text-purple-700">Updating phone setup…</p>}{message&&<p role="status" className="mt-3 text-sm text-purple-700">{message}</p>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <p className="mt-3 text-xs text-slate-500">Internet and notification permission are required. Phone Focus and battery settings may delay alerts. Signing out disables alerts on this device.</p>
  </section>;
}

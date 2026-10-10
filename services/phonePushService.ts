import { supabase } from './supabaseClient';

type InstallPrompt = Event & { prompt:()=>Promise<void>; userChoice:Promise<{outcome:string}> };
export type PhonePreferences={assignments:boolean;reminders:boolean;coverage:boolean};
export type PhoneDevice={id:string;active:boolean;preferences:PhonePreferences;last_accepted_at?:string;last_displayed_at?:string;last_test?:{state:string;accepted_at?:string;displayed_at?:string}};
export const defaultPhonePreferences:PhonePreferences={assignments:true,reminders:true,coverage:true};
let installPrompt:InstallPrompt|null=null;
let registration:Promise<ServiceWorkerRegistration>|null=null;
let ownerGeneration=0;
export const isHomeScreen=()=>window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone===true;
export const isIPhone=()=>/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
export const pushSupported=()=>window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const canInstall=()=>Boolean(installPrompt);
export function startPhoneInstallListener() {
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event as InstallPrompt;window.dispatchEvent(new Event('hris-install-change'));});
  window.addEventListener('appinstalled',()=>{installPrompt=null;window.dispatchEvent(new Event('hris-install-change'));});
}
export async function installHris() {
  if(!installPrompt) return false;
  const prompt=installPrompt;await prompt.prompt();const choice=await prompt.userChoice;installPrompt=null;window.dispatchEvent(new Event('hris-install-change'));return choice.outcome==='accepted';
}
export function phoneWorker() {
  if(!('serviceWorker' in navigator)) return Promise.reject(new Error('This browser does not support phone notifications'));
  if(!registration) registration=navigator.serviceWorker.register('/hris-sw.js',{scope:'/'}).then(async reg=>{
    if(!reg.active) await new Promise<void>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(new Error('Phone setup took too long. Reload and try again.')),15000);
      const worker=reg.installing || reg.waiting;
      if(!worker){window.clearTimeout(timeout);resolve();return;}
      const check=()=>{if(worker.state==='activated'){window.clearTimeout(timeout);resolve();}else if(worker.state==='redundant'){window.clearTimeout(timeout);reject(new Error('Phone setup could not be installed'));}};
      worker.addEventListener('statechange',check);check();
    });return reg;
  }).catch(e=>{registration=null;throw e;});
  return registration;
}
async function tellWorker(owner:string|null) {
  const reg=await phoneWorker();
  const channel=new MessageChannel();
  await new Promise<void>((resolve,reject)=>{
    const timeout=window.setTimeout(()=>reject(new Error('Phone setup could not be saved')),5000);
    channel.port1.onmessage=event=>{window.clearTimeout(timeout);channel.port1.close();event.data?.ok?resolve():reject(new Error('Phone setup could not be saved'));};
    reg.active?.postMessage({type:'HRIS_PHONE_OWNER',owner,backend:{url:import.meta.env.VITE_SUPABASE_URL,key:import.meta.env.VITE_SUPABASE_ANON_KEY}},[channel.port2]);
  });return reg;
}
export async function phoneConfiguration() {
  const {data,error}=await supabase.rpc('phone_push_configuration');if(error) throw new Error(error.message);return data as {enabled:boolean;public_key:string};
}
export async function currentPhoneDevice() {
  if(!pushSupported()) return null;
  const reg=await phoneWorker();
  const subscription=await reg.pushManager.getSubscription();if(!subscription) return null;
  // Retry a display receipt when the worker could not reach the server while in the background.
  const visible=await reg.getNotifications();
  await Promise.all(visible.filter(n=>n.data?.job && n.data?.receipt).map(n=>supabase.rpc('phone_push_receipt',{p_job:n.data.job,p_token:n.data.receipt}).then(()=>{})));
  const {data,error}=await supabase.rpc('phone_push_status',{p_endpoint:subscription.endpoint});if(error) throw new Error(error.message);return data as PhoneDevice|null;
}
export async function bindPhoneOwner(owner:string) {
  if(!window.isSecureContext || !('serviceWorker' in navigator)) return;
  const generation=++ownerGeneration;
  const reg=await tellWorker(owner);
  if(generation!==ownerGeneration) return;
  // Rebind only an existing permission/subscription, never prompt on page load.
  if(pushSupported() && Notification.permission==='granted') {
    const sub=await reg.pushManager.getSubscription();
    if(sub) {const {error}=await supabase.rpc('phone_push_save',{p_subscription:sub.toJSON(),p_label:isIPhone()?'iPhone / iPad':'Browser / Android'});if(error) throw new Error(error.message);}
  }
}
function keyBytes(key:string) {
  const data=atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'='));return Uint8Array.from(data,c=>c.charCodeAt(0));
}
export async function enablePhone(owner:string,publicKey:string,preferences:PhonePreferences) {
  if(isIPhone() && !isHomeScreen()) throw new Error('Add HRIS to your Home Screen and open its icon first.');
  if(!pushSupported()) throw new Error('Use an up-to-date browser with phone notification support.');
  // Called immediately from a user click: iPhone permission requires this gesture.
  const permission=await Notification.requestPermission();
  if(permission!=='granted') throw new Error('Notifications were not allowed. You can enable them in your phone or browser settings.');
  const reg=await tellWorker(owner);
  let sub=await reg.pushManager.getSubscription();
  const desired=keyBytes(publicKey);
  if(sub?.options.applicationServerKey && Array.from(new Uint8Array(sub.options.applicationServerKey)).join(',')!==Array.from(desired).join(',')){await sub.unsubscribe();sub=null;}
  sub=sub || await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:desired});
  const {data,error}=await supabase.rpc('phone_push_save',{p_subscription:sub.toJSON(),p_preferences:preferences,p_label:isIPhone()?'iPhone / iPad':'Browser / Android'});
  if(error) throw new Error(error.message);return data as PhoneDevice;
}
export async function savePhonePreferences(preferences:PhonePreferences) {
  const sub=await(await phoneWorker()).pushManager.getSubscription();if(!sub) throw new Error('Enable phone notifications first');
  const {data,error}=await supabase.rpc('phone_push_save',{p_subscription:sub.toJSON(),p_preferences:preferences,p_label:isIPhone()?'iPhone / iPad':'Browser / Android'});
  if(error) throw new Error(error.message);return data as PhoneDevice;
}
export async function disablePhone() {
  if(!('serviceWorker' in navigator)) return;
  ++ownerGeneration;
  const reg=await tellWorker(null),sub=await reg.pushManager.getSubscription();
  if(sub) {const {error}=await supabase.rpc('phone_push_disable',{p_endpoint:sub.endpoint});await sub.unsubscribe();if(error) throw new Error(error.message);}
  const notifications=await reg.getNotifications();notifications.forEach(n=>n.close());
}
export async function detachPhoneOnLogout() {
  // Clear local ownership first so an offline logout cannot display the previous account's alerts.
  try {await disablePhone();}catch { /* Browser subscription/owner cleanup still runs if the server is offline. */ }
}
export async function clearLocalPhoneOwner() {
  ++ownerGeneration;
  if(!('serviceWorker' in navigator)) return;
  const reg=await navigator.serviceWorker.getRegistration('/');
  if(reg?.active?.scriptURL.endsWith('/hris-sw.js')) {
    const channel=new MessageChannel();
    await new Promise<void>(resolve=>{const timer=window.setTimeout(resolve,1500);channel.port1.onmessage=()=>{window.clearTimeout(timer);channel.port1.close();resolve();};reg.active!.postMessage({type:'HRIS_PHONE_OWNER',owner:null},[channel.port2]);});
    const sub=await reg.pushManager.getSubscription();if(sub) await sub.unsubscribe();
  }
}
export async function testPhone(deviceId:string) {
  const {data}=await supabase.auth.getSession();if(!data.session) throw new Error('Please sign in again');
  const response=await fetch('/api/phone-push',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({device_id:deviceId})});
  const result=await response.json();if(!response.ok) throw new Error(result.error || 'Test notification failed');return result;
}

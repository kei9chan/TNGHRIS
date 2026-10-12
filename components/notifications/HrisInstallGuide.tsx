import React, {useRef, useState} from 'react';
import {hrisInstallUrl, isIosDevice, isIosEmbeddedBrowser} from '../../services/hrisInstallation';

export default function HrisInstallGuide({showPlatformPicker=false}: {showPlatformPicker?: boolean}) {
  const [platform,setPlatform]=useState<'ios'|'android'>(()=>isIosDevice()?'ios':'android');
  const [message,setMessage]=useState('');
  const address=useRef<HTMLInputElement>(null);
  const url=hrisInstallUrl();
  const copyLink=async()=>{
    try {
      if(!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setMessage('Link copied. Open Safari and paste it into the address bar.');
    } catch {
      address.current?.focus();address.current?.select();
      setMessage('Touch and hold the selected link, choose Copy, then paste it in Safari.');
    }
  };
  return <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
    {showPlatformPicker&&<div className="flex gap-2" aria-label="Installation device">
      {(['ios','android'] as const).map(value=><button key={value} type="button" aria-pressed={platform===value} onClick={()=>{setPlatform(value);setMessage('');}} className={`min-h-11 rounded-lg border px-4 py-2 font-medium ${platform===value?'border-purple-600 bg-purple-600 text-white':'border-slate-300 bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>{value==='ios'?'iPhone / iPad':'Android'}</button>)}
    </div>}
    {platform==='ios'?<>
      <h3 className="font-semibold text-slate-900 dark:text-white">iPhone / iPad setup</h3>
      {isIosEmbeddedBrowser()&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">Open this link in Safari first. This in-app browser may not offer Add to Home Screen.</p>}
      <ol className="list-decimal space-y-2 pl-5">
        <li>Open HRIS in <b>Safari</b>. If you came from Gmail or a messaging app, use its menu to open in Safari, or copy the link below.</li>
        <li>Tap <b>Share</b> <svg aria-label="Safari Share icon" role="img" className="inline h-5 w-5 align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>. On newer Safari layouts, tap <b>…</b> or the page menu first.</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Keep <b>Open as Web App</b> on if shown, then tap <b>Add</b>.</li>
        <li>Open the <b>TNG HRIS</b> icon from your Home Screen. Sign in there if asked.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">HRIS link to open in Safari</span><input ref={address} aria-label="HRIS link to open in Safari" readOnly value={url} onFocus={event=>event.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"/></label>
        <button type="button" onClick={()=>void copyLink()} className="min-h-11 rounded-lg border border-purple-300 px-3 py-2 font-medium text-purple-700 dark:text-purple-300">Copy HRIS link</button>
      </div>
      {message&&<p role="status">{message}</p>}
      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-600"><summary className="cursor-pointer font-medium">Cannot find Add to Home Screen?</summary><p className="mt-2">In Safari’s Share menu, scroll to the bottom → Edit Actions → add Add to Home Screen. If you only see a bookmark, keep Open as Web App on when adding it. For a managed work phone, an administrator may restrict adding apps.</p></details>
      <p className="text-xs text-slate-500 dark:text-slate-400">For alerts, open the installed icon → Notifications → Enable phone notifications → Allow. Notifications need iOS / iPadOS 16.4 or later. Adding the icon alone does not enable alerts.</p>
    </>:<>
      <h3 className="font-semibold text-slate-900 dark:text-white">Android / browser setup</h3>
      <p>Open HRIS in Chrome → ⋮ menu → Install app or Add to Home Screen → confirm. Open the new icon, then enable phone notifications in HRIS.</p>
    </>}
  </div>;
}

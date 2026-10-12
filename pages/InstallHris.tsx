import React from 'react';
import HrisInstallGuide from '../components/notifications/HrisInstallGuide';
import {isStandaloneApp} from '../services/hrisInstallation';

// Public setup page: no account, payroll permissions or notification APIs needed.
export default function InstallHris() {
  const installed=isStandaloneApp();
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
    <section className="mx-auto max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <header className="flex items-center gap-3"><img src="/hris-icons/apple-touch-icon.png" alt="" className="h-14 w-14 rounded-xl"/><div><h1 className="text-xl font-bold">Install TNG HRIS</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Add it to your phone’s Home Screen.</p></div></header>
      {installed?<><p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">HRIS is already open as an app.</p><a href="/notifications" className="inline-block min-h-11 rounded-xl bg-purple-600 px-4 py-3 font-semibold text-white">Set up phone notifications</a></>:<HrisInstallGuide showPlatformPicker/>}
      <a href="/dashboard" className="inline-block min-h-11 py-3 font-medium text-purple-700 underline dark:text-purple-300">{installed?'Open HRIS':'Continue to HRIS sign-in'}</a>
    </section>
  </main>;
}

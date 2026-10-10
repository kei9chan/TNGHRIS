import React from 'react';
export const inputClass = 'w-full min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
export const buttonClass = 'min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700';
export const primaryClass = 'min-h-11 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50';
export function Field({label,children}: {label: string; children: React.ReactNode}) { return <label className="block space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>; }
export function OpsIcon({name,className='h-5 w-5'}: {name: string; className?: string}) {
  const paths: Record<string,string> = { Today:'M8 2v4m8-4v4M4 9h16M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1Z M8 13h3v3H8Z',Progress:'m3 17 6-6 4 3 8-10m-6 0h6v6',Tasks:'M9 4H5v17h14V4h-4M9 2h6v4H9ZM8 11h8m-8 5h8',Settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',menu:'M4 6h16M4 12h16M4 18h16',library:'M3 21h18M5 9v9m5-9v9m4-9v9m5-9v9M3 7l9-5 9 5H3Z'};
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.Tasks}/></svg>;
}

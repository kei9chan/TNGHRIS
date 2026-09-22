import React from 'react';
import { LeaveBalance } from '../../types';

interface LeaveBalanceCardProps {
  balance: LeaveBalance & { available: number; name: string; pending?: number; asOfDate?: string; lastUpdatedBy?: string; approvalStatus?: string };
}

const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ balance }) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex justify-between gap-4">
        <div><h3 className="text-lg font-bold text-slate-900 dark:text-white">{balance.name}</h3><p className="text-sm text-slate-500">Balance as of {balance.asOfDate ? new Date(balance.asOfDate).toLocaleDateString('en-PH',{month:'long',day:'numeric',year:'numeric'}) : 'today'}</p></div>
        <div className="text-right"><div className="text-3xl font-black text-violet-700 dark:text-violet-300">{balance.available.toFixed(3)}</div><p className="text-sm text-slate-500">Remaining balance</p></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm sm:grid-cols-5">
        {[['Opening balance',balance.opening],['Accrued',balance.accrued],['Used',balance.used],['Approved adjustments',balance.adjusted],['Pending requests',balance.pending||0]].map(([label,value])=><div key={String(label)}><span className="block text-xs text-slate-500">{label}</span><strong>{Number(value).toFixed(3)}</strong></div>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900"><span>Last updated by <strong>{balance.lastUpdatedBy||'System ledger'}</strong></span><span className={`rounded-full px-2 py-1 font-bold ${balance.approvalStatus?.toLowerCase().includes('pending')?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-700'}`}>{balance.approvalStatus||'Active'}</span></div>
    </div>
  );
};

export default LeaveBalanceCard;

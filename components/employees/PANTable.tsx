import React from 'react';
import { PAN, PANActionTaken, PANStatus } from '../../types';
import Button from '../ui/Button';

interface PANTableProps {
  records: PAN[];
  onEdit: (record: PAN) => void;
  onPrint?: (record: PAN) => void;
  isEmployeeView?: boolean;
  isManagerView?: boolean;
}

const getStatusColor = (status: PAN['status']) => {
  if (status === PANStatus.Completed) return 'bg-emerald-100 text-emerald-800';
  if ([PANStatus.Declined, PANStatus.ReturnedForEdits, PANStatus.Cancelled].includes(status)) return 'bg-red-100 text-red-800';
  if ([PANStatus.PendingApproval, PANStatus.PendingRecommender, PANStatus.PendingEndorser, PANStatus.PendingEmployee].includes(status)) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
};

const getActionType = (action: PANActionTaken) => {
  const labels: string[] = [];
  if (action?.changeOfStatus) labels.push('Status change');
  if (action?.promotion) labels.push('Promotion');
  if (action?.transfer) labels.push('Transfer');
  if (action?.salaryIncrease) labels.push('Salary increase');
  if (action?.changeOfJobTitle) labels.push('Job title change');
  if (action?.others) labels.push(action.others);
  return labels.join(', ') || 'Update';
};

const getStatusLabel = (status: PANStatus) => status === PANStatus.Completed ? 'Accepted' : status === PANStatus.Declined ? 'Rejected' : status;

const PANTable: React.FC<PANTableProps> = ({ records, onEdit, onPrint, isEmployeeView, isManagerView }) => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>{['Employee', 'Effective date', 'Action', 'Status', ''].map((heading, index) => <th key={index} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {records.map(record => (
            <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className="px-5 py-4 text-sm"><div className="font-semibold text-slate-900 dark:text-white">{record.employeeName}</div><div className="text-xs text-slate-500">PAN-{record.id.slice(0, 8).toUpperCase()}</div></td>
              <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{new Date(record.effectiveDate).toLocaleDateString()}</td>
              <td className="max-w-[260px] px-5 py-4 text-sm text-slate-600 dark:text-slate-300">{getActionType(record.actionTaken)}</td>
              <td className="whitespace-nowrap px-5 py-4 text-sm"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(record.status)}`}>{getStatusLabel(record.status)}</span></td>
              <td className="whitespace-nowrap px-5 py-4 text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => onEdit(record)}>{isEmployeeView ? 'View / Sign' : isManagerView && [PANStatus.PendingRecommender, PANStatus.PendingEndorser, PANStatus.PendingApproval].includes(record.status) ? 'Review' : record.status === PANStatus.Draft ? 'Edit' : 'View'}</Button>{onPrint && <Button size="sm" variant="secondary" onClick={() => onPrint(record)}>Preview</Button>}</div></td>
            </tr>
          ))}
          {!records.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No PAN records found.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
);

export default PANTable;

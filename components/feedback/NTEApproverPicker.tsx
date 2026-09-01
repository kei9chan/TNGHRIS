import React, { useMemo, useState } from 'react';
import { EligibleNTEApprover, NTEApproverSelection } from '../../services/nteService';
import { formatEmployeeName } from '../../services/formatEmployeeName';

interface NTEApproverPickerProps {
  approvers: EligibleNTEApprover[];
  selected: NTEApproverSelection[];
  onChange: (selected: NTEApproverSelection[]) => void;
  loading?: boolean;
  error?: string | null;
}

const roleLabelFor = (approver: EligibleNTEApprover, roleId: string) => {
  const index = approver.eligibleRoleIds.indexOf(roleId);
  return approver.eligibleRoleLabels[index] || roleId;
};

const NTEApproverPicker: React.FC<NTEApproverPickerProps> = ({ approvers, selected, onChange, loading = false, error }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(selected.map(item => item.approver.id)), [selected]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return approvers.filter(approver => {
      if (selectedIds.has(approver.id)) return false;
      if (!term) return true;
      return [
        approver.name,
        approver.email,
        approver.position,
        approver.businessUnit,
        ...approver.eligibleRoleIds,
        ...approver.eligibleRoleLabels,
      ].some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [approvers, search, selectedIds]);
  const hasBod = selected.some(item => item.roleId === 'Board of Director');

  const addApprover = (approver: EligibleNTEApprover) => {
    onChange([...selected, { approver, roleId: approver.preferredRoleId }]);
    setSearch('');
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Request Approval From</label>
        <div className="relative mt-1">
          <input
            value={search}
            onChange={event => { setSearch(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Loading eligible approvers…' : 'Search name, role, position, business unit, or email'}
            disabled={loading || !!error}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          {open && !loading && !error && (
            <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
              {filtered.length ? filtered.map(approver => (
                <button
                  key={approver.id}
                  type="button"
                  onClick={() => addApprover(approver)}
                  className="block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-indigo-50 last:border-b-0 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">{formatEmployeeName(approver.name)}</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    {approver.eligibleRoleLabels.join(' / ')} · {approver.position || 'Position not recorded'} · {approver.businessUnit || 'Business unit not recorded'} · {approver.email || 'Email not recorded'}
                  </span>
                </button>
              )) : <p className="px-4 py-3 text-sm text-gray-500">No eligible active approvers match your search.</p>}
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
        {!loading && !error && approvers.length === 0 && <p className="mt-1 text-sm text-amber-700">No eligible active NTE approvers found.</p>}
      </div>

      <div className="space-y-2">
        {selected.map(item => (
          <div key={item.approver.id} className={`rounded-lg border p-3 ${item.roleId === 'Board of Director' ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">{formatEmployeeName(item.approver.name)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.approver.position || 'Position not recorded'} · {item.approver.businessUnit || 'Business unit not recorded'} · {item.approver.email || 'Email not recorded'}</p>
                {item.approver.eligibleRoleIds.length > 1 ? (
                  <label className="mt-2 block text-xs font-medium text-gray-600 dark:text-gray-300">
                    Role used for this approval
                    <select
                      value={item.roleId}
                      onChange={event => onChange(selected.map(value => value.approver.id === item.approver.id ? { ...value, roleId: event.target.value } : value))}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
                    >
                      {item.approver.eligibleRoleIds.map(roleId => <option key={roleId} value={roleId}>{roleLabelFor(item.approver, roleId)}</option>)}
                    </select>
                  </label>
                ) : <p className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{roleLabelFor(item.approver, item.roleId)}</p>}
              </div>
              <button type="button" onClick={() => onChange(selected.filter(value => value.approver.id !== item.approver.id))} className="text-sm font-semibold text-red-600 hover:text-red-700">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div role="status" className={`rounded-md border px-3 py-2 text-sm font-semibold ${hasBod ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
        {hasBod ? 'BOD approver added' : 'At least one Board of Director is required'}
      </div>
    </div>
  );
};

export default NTEApproverPicker;

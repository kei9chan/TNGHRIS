import React, { useEffect, useState } from 'react';
import { User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface AccountLifecycleModalProps {
  user: User;
  isOpen: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string, markDuplicate: boolean) => void;
}

const AccountLifecycleModal: React.FC<AccountLifecycleModalProps> = ({ user, isOpen, saving, onClose, onConfirm }) => {
  const reactivating = user.status === 'Inactive';
  const [reason, setReason] = useState('');
  const [markDuplicate, setMarkDuplicate] = useState(Boolean(user.isDuplicate));
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setMarkDuplicate(Boolean(user.isDuplicate));
      setError('');
    }
  }, [isOpen, user]);

  const submit = () => {
    if (reason.trim().length < 5) {
      setError('Please provide a reason of at least 5 characters.');
      return;
    }
    onConfirm(reason.trim(), reactivating ? false : markDuplicate);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={reactivating ? `Reactivate ${user.name}` : `Inactivate ${user.name}`}
      size="lg"
      footer={<div className="flex w-full justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : reactivating ? 'Reactivate Account' : 'Confirm Inactivation'}</Button></div>}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {reactivating
          ? 'This restores login access. Historical employee and workflow records remain unchanged.'
          : 'This blocks login and removes the account from active lists without deleting its employee profile or history.'}
      </p>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40 sm:grid-cols-2">
        <div><dt className="text-xs uppercase text-gray-500">Account</dt><dd className="font-medium">{user.name}<br /><span className="font-normal text-gray-500">{user.email}</span></dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Linked employee</dt><dd className="font-medium">{user.employeeId || user.id}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Role</dt><dd className="font-medium">{(user.roles || [user.role]).join(', ')}</dd></div>
        <div><dt className="text-xs uppercase text-gray-500">Business unit</dt><dd className="font-medium">{user.businessUnit || 'Not assigned'}</dd></div>
      </dl>
      {!reactivating && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Linked payroll, leave, evaluations, tickets, contracts, documents, approvals, and audit history will be preserved. This action never hard-deletes the employee or those records.
        </p>
      )}
      {!reactivating && (
        <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <input type="checkbox" className="mt-1" checked={markDuplicate} onChange={event => setMarkDuplicate(event.target.checked)} />
          <span><strong>Mark as duplicate</strong><br />Keep this account available in the Duplicate accounts filter.</span>
        </label>
      )}
      <div>
        <label htmlFor="account-lifecycle-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason</label>
        <textarea id="account-lifecycle-reason" rows={4} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white" placeholder={reactivating ? 'Why is this account being restored?' : 'Why is this account obsolete or duplicated?'} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
};

export default AccountLifecycleModal;

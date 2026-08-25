import React, { useState } from 'react';
import { User } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { generateTemporaryPassword, manageUserPassword } from '../../services/passwordManagementService';

interface PasswordManagementModalProps {
  user: User;
  onClose: () => void;
}

const PasswordManagementModal: React.FC<PasswordManagementModalProps> = ({ user, onClose }) => {
  const [temporaryPassword, setTemporaryPassword] = useState(generateTemporaryPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [manualResetLink, setManualResetLink] = useState('');

  const run = async (action: 'send_reset_link' | 'set_temporary_password') => {
    setSaving(true);
    setError('');
    setMessage('');
    setManualResetLink('');
    try {
      const result = await manageUserPassword({
        action,
        targetUserId: user.id,
        temporaryPassword: action === 'set_temporary_password' ? temporaryPassword : undefined,
      });
      if (result.manualResetLink) setManualResetLink(result.manualResetLink);
      setMessage(action === 'send_reset_link'
        ? result.delivered
          ? `A working password-reset link was sent to ${user.email}.`
          : (result.warning || 'The email could not be delivered. Copy the secure reset link below and share it privately with the user.')
        : 'Temporary password created. Share it securely with the user.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The password action could not be completed.');
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = async () => {
    await navigator.clipboard.writeText(temporaryPassword);
    setMessage('Temporary password copied to the clipboard.');
  };

  const copyResetLink = async () => {
    await navigator.clipboard.writeText(manualResetLink);
    setMessage('Secure reset link copied. Share it privately with the intended user; it expires after use.');
  };

  return (
    <Modal isOpen onClose={onClose} title={`Password access — ${user.name}`} size="lg" footer={(
      <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
    )}>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-slate-600 dark:bg-slate-900/40">
        <p className="font-semibold text-gray-900 dark:text-white">{user.email}</p>
        <p className="mt-1 text-gray-600 dark:text-slate-300">Use a reset link whenever possible. A temporary password gives immediate account access and must be shared through a secure channel.</p>
      </div>

      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {manualResetLink && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Email delivery is unavailable, but the secure reset link is ready.</p>
          <p className="mt-1">Copy it and send it only to {user.name} through a private channel.</p>
          <Button className="mt-3" variant="secondary" onClick={copyResetLink}>Copy secure reset link</Button>
        </div>
      )}

      <section className="rounded-lg border border-gray-200 p-4 dark:border-slate-600">
        <h4 className="font-semibold text-gray-900 dark:text-white">Send password-reset link</h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">Emails a secure, expiring link that opens the Set New Password page.</p>
        <Button className="mt-3" disabled={saving || user.status !== 'Active'} isLoading={saving} onClick={() => run('send_reset_link')}>Send reset link</Button>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
        <h4 className="font-semibold text-gray-900 dark:text-white">Create temporary password</h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">The user can sign in immediately with this password. Generate a new value if it may have been exposed.</p>
        <label htmlFor="temporary-password" className="mt-3 block text-sm font-medium text-gray-700 dark:text-slate-200">Temporary password</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="temporary-password"
            type={showPassword ? 'text' : 'password'}
            value={temporaryPassword}
            onChange={event => setTemporaryPassword(event.target.value)}
            autoComplete="new-password"
            className="min-w-64 flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <Button variant="secondary" onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</Button>
          <Button variant="secondary" onClick={copyPassword}>Copy</Button>
          <Button variant="secondary" onClick={() => { setTemporaryPassword(generateTemporaryPassword()); setMessage(''); }}>Regenerate</Button>
        </div>
        <p className="mt-2 text-xs text-gray-600 dark:text-slate-300">Minimum 12 characters with uppercase, lowercase, number, and symbol.</p>
        <Button className="mt-3" variant="danger" disabled={saving || user.status !== 'Active' || temporaryPassword.length < 12} isLoading={saving} onClick={() => run('set_temporary_password')}>Set temporary password</Button>
      </section>
    </Modal>
  );
};

export default PasswordManagementModal;

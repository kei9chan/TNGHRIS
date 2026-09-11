import React, { useEffect, useState } from 'react';
import { User } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { getAccountAccessDiagnostics, manageUserPassword } from '../../services/passwordManagementService';

const PasswordManagementModal: React.FC<{ user: User; onClose: () => void }> = ({ user, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const refresh = async () => setDiagnostic((await getAccountAccessDiagnostics(user.id))[0]);
  useEffect(() => { let live = true; getAccountAccessDiagnostics(user.id).then(rows => { if (live) setDiagnostic(rows[0]); }).catch(() => { if (live) setError('Account diagnostics could not be loaded.'); }); return () => { live = false; }; }, [user.id]);
  const send = async () => {
    if (saving) return;
    setSaving(true); setMessage(''); setError('');
    try {
      await manageUserPassword({ action: 'send_reset_link', targetUserId: user.id });
      setMessage('The email provider accepted the reset email. Ask the employee to check their inbox and spam folder.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The reset email could not be sent.'); }
    finally { try { await refresh(); } catch { setError('The latest delivery status could not be loaded.'); } setSaving(false); }
  };
  const entries = diagnostic ? [
    ['Account email', diagnostic.masked_email], ['Employee status', diagnostic.status],
    ['Auth account', diagnostic.auth_exists ? 'Exists' : 'Missing'], ['Email verified', diagnostic.email_confirmed ? 'Yes' : 'Awaiting employee verification'],
    ['Profile link', diagnostic.link_valid ? 'Matched' : 'Requires review'], ['Auth blocked', diagnostic.banned ? 'Yes' : 'No'],
    ['Active roles', (diagnostic.active_roles || []).join(', ') || 'None'], ['Business unit', diagnostic.business_unit_valid ? diagnostic.business_unit : 'Requires review'],
    ['Last successful authentication', diagnostic.last_sign_in_at ? new Date(diagnostic.last_sign_in_at).toLocaleString() : 'None recorded'],
    ['Recent failed logins', 'Unavailable in retained Auth logs'],
    ['Last reset request', diagnostic.last_reset_request ? new Date(diagnostic.last_reset_request).toLocaleString() : 'None recorded'],
    ['Reset email status', diagnostic.reset_status || 'None recorded'], ['Delivery failure', diagnostic.reset_failure || 'None recorded'],
  ] : [];
  return <Modal isOpen onClose={onClose} title={`Account access — ${user.name}`} size="lg" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    <p className="text-sm text-gray-600 dark:text-slate-300">Send a secure recovery email. The employee chooses their own password using the emailed link.</p>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {!diagnostic ? <p>Loading account diagnostics…</p> : <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{entries.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border p-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="break-words text-sm font-medium">{value}</dd></div>)}</dl>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{diagnostic.recommended_action}</p>
      {diagnostic.active_name_count > 1 && <p role="alert" className="text-sm text-amber-700">Multiple active records have this name. Verify the employee ID and email with HR before making identity changes.</p>}
    </>}
    <Button disabled={saving || user.status !== 'Active'} isLoading={saving} onClick={send}>Send recovery email</Button>
  </Modal>;
};
export default PasswordManagementModal;

import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { bootstrapPayrollAccess, grantPayrollAccess, revokePayrollAccess, notifyPayrollAccessChanged, PAYROLL_PERMISSIONS, PayrollPermission, payrollPermissionLabel } from './access';
import { usePayrollAccess } from './usePayrollAccess';

const fieldClass = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white';

const PayrollAccessCard: React.FC<{ employeeId?: string }> = ({ employeeId }) => {
  const { context, loading, error, reload } = usePayrollAccess(employeeId);
  const id = useId();
  const [scopeId, setScopeId] = useState('');
  const [permission, setPermission] = useState<PayrollPermission>('prepare_pr');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mutationError, setMutationError] = useState('');
  const managedScopes = context?.scopes.filter(scope => scope.canManage) || [];
  const canEdit = Boolean(context && !context.isSelf && context.targetLinked && managedScopes.length && employeeId);
  const selectedScopeId = managedScopes.some(scope => scope.id === scopeId) ? scopeId : managedScopes[0]?.id || '';
  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setMutationError(''); setMessage('');
    try {
      await action();
      setReason(''); setMessage(success); notifyPayrollAccessChanged();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally { setBusy(false); }
  };

  if (loading) return <Card title="Payroll Access"><p role="status">Checking payroll access…</p></Card>;
  if (error || !context) return <Card title="Payroll Access"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{error || 'Payroll access is unavailable.'}</p><Button className="mt-3" variant="secondary" onClick={() => void reload()}>Retry</Button></Card>;
  // A general profile viewer never sees another employee's access assignments.
  if (!context.isSelf && !managedScopes.length) return null;

  return <Card title="Payroll Access" id="payroll-access">
    <div className="space-y-4 text-gray-700 dark:text-slate-200">
      <p className="text-sm">Payroll duties are assigned separately from HRIS roles and employee pay eligibility.</p>
      {message && <p role="status" className="text-sm text-green-700 dark:text-green-300">{message}</p>}
      {mutationError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{mutationError}</p>}
      {!context.targetLinked && <p className="text-sm">This employee needs a linked, active HRIS account before access can be assigned.</p>}
      {context.grants.length > 0 ? <ul className="divide-y divide-gray-200 dark:divide-slate-700">
        {context.grants.map(grant => <li key={grant.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-medium">{payrollPermissionLabel(grant.permission)}</p><p className="text-sm text-gray-500 dark:text-slate-400">{context.scopes.find(scope => scope.id === grant.scopeId)?.name || 'Assigned scope'}</p></div>
          {canEdit && managedScopes.some(scope => scope.id === grant.scopeId) && <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => revokePayrollAccess(grant.id, reason), 'Payroll access revoked. Future requests will be denied.')}>Revoke</Button>}
        </li>)}
      </ul> : <p className="text-sm">No payroll duties assigned.</p>}

      {context.isSelf && managedScopes.length > 0 && <>
        <p className="text-sm">Another payroll access manager must change your own permissions.</p>
        <Link className="inline-block font-medium text-indigo-600 dark:text-indigo-300" to="/payroll/access">Manage payroll access →</Link>
      </>}

      {(canEdit || (context.canBootstrap && context.isSelf)) && <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-slate-700">
        {canEdit && <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={`${id}-scope`} className="text-sm font-medium">Business unit / payroll group
            <select id={`${id}-scope`} className={fieldClass} value={selectedScopeId} onChange={event => setScopeId(event.target.value)} disabled={busy}>
              {managedScopes.map(scope => <option key={scope.id} value={scope.id}>{scope.name}{scope.kind === 'payroll_group' ? ' (payroll group)' : ''}</option>)}
            </select>
          </label>
          <label htmlFor={`${id}-permission`} className="text-sm font-medium">Payroll duty
            <select id={`${id}-permission`} className={fieldClass} value={permission} onChange={event => setPermission(event.target.value as PayrollPermission)} disabled={busy}>
              {PAYROLL_PERMISSIONS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>}
        <label htmlFor={`${id}-reason`} className="block text-sm font-medium">Reason for this access change
          <textarea id={`${id}-reason`} className={fieldClass} rows={2} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} placeholder="Record why access is being granted or revoked" />
        </label>
        {canEdit && <Button isLoading={busy} disabled={!selectedScopeId || reason.trim().length < 3} onClick={() => void run(() => grantPayrollAccess(employeeId!, selectedScopeId, permission, reason), 'Payroll access granted.')}>Grant access</Button>}
        {context.canBootstrap && context.isSelf && <>
          <p className="text-sm">Initial setup makes you the first Payroll Access manager for all business units. It grants access administration only.</p>
          <Button isLoading={busy} disabled={reason.trim().length < 3} onClick={() => void run(() => bootstrapPayrollAccess(reason), 'Payroll Access is set up. You can now assign duties to other users.')}>Set up Payroll Access</Button>
        </>}
      </div>}
      {context.history.length > 0 && <details className="border-t border-gray-200 pt-3 dark:border-slate-700">
        <summary className="cursor-pointer text-sm font-medium">Recent access history</summary>
        <ul className="mt-3 space-y-3 text-sm">{context.history.map((entry,index) => <li key={`${entry.occurredAt}-${index}`}>
          <p className="font-medium">{entry.action === 'bootstrap' ? 'Initial setup' : entry.action === 'grant' ? 'Granted' : 'Revoked'} · {payrollPermissionLabel(entry.permission || '')}</p>
          <p>{entry.reason}</p><p className="text-gray-500 dark:text-slate-400">{new Date(entry.occurredAt).toLocaleString()}</p>
        </li>)}</ul>
      </details>}
    </div>
  </Card>;
};

export default PayrollAccessCard;

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import PayrollAccessCard from './PayrollAccessCard';
import { createPayrollGroupScope, fetchPayrollRecipients, notifyPayrollAccessChanged, PayrollRecipient, payrollPermissionLabel } from './access';
import { usePayrollAccess } from './usePayrollAccess';

const fieldClass = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white';

export default function PayrollAccessPage({ staffOnly = false }: { staffOnly?: boolean }) {
  const { context, loading, error, reload } = usePayrollAccess();
  const [recipients, setRecipients] = useState<PayrollRecipient[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [recipientError, setRecipientError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupBu, setGroupBu] = useState('');
  const [groupReason, setGroupReason] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = Boolean(context?.scopes.some(scope => scope.canManage));
  const managedBus = context?.scopes.filter(scope => scope.kind === 'business_unit' && scope.canManage) || [];
  const selectedBu = managedBus.some(scope => scope.businessUnitId === groupBu) ? groupBu : managedBus[0]?.businessUnitId || '';
  useEffect(() => {
    let active = true;
    setRecipients([]); setRecipientError('');
    if (canManage) fetchPayrollRecipients().then(data => { if (active) setRecipients(data); }).catch(err => { if (active) setRecipientError(err.message); });
    return () => { active = false; };
  }, [canManage, context]);

  if (loading) return <div className="p-6" role="status">Checking payroll access…</div>;
  if (error || !context) return <Card title="Payroll access unavailable"><p role="alert">{error || 'Access could not be verified.'}</p><Button className="mt-4" onClick={() => void reload()}>Retry</Button></Card>;
  if (staffOnly && context.myGrants.length === 0) return <Card title="Access denied"><p>You do not have staff payroll access.</p><Link className="mt-4 inline-block text-indigo-600 dark:text-indigo-300" to="/payroll/access">View my Payroll Access</Link></Card>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Payroll Access</h1><p className="mt-1 text-gray-600 dark:text-slate-300">Assign payroll duties and control who can work with each business unit or group.</p></div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Payroll processing off</span>
    </div>
    {staffOnly && <Card><p className="text-gray-700 dark:text-slate-200">Payroll processing is off. Your assigned duties are shown below; calculations, approvals and payment releases are unavailable.</p></Card>}
    <PayrollAccessCard />
    {canManage && <>
      <Card title="Assign payroll duties">
        {recipientError ? <p role="alert" className="text-red-700 dark:text-red-300">{recipientError}</p> : <label htmlFor="payroll-recipient" className="text-sm font-medium text-gray-700 dark:text-slate-200">Employee
          <select id="payroll-recipient" className={fieldClass} value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
            <option value="">Select an employee</option>
            {recipients.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name}{recipient.employeeCode ? ` · ${recipient.employeeCode}` : ''}</option>)}
          </select>
        </label>}
      </Card>
      {employeeId && recipients.some(recipient => recipient.id === employeeId) && <PayrollAccessCard key={employeeId} employeeId={employeeId} />}
    </>}
    {context.scopes.length > 0 && <Card title="Business units and payroll groups">
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm text-gray-700 dark:text-slate-200">
        <thead><tr className="border-b border-gray-200 dark:border-slate-700"><th className="py-3 pr-4">Scope</th><th className="py-3 pr-4">Your duties</th><th className="py-3">Processing</th></tr></thead>
        <tbody>{context.scopes.map(scope => <tr key={scope.id} className="border-b border-gray-100 dark:border-slate-700">
          <td className="py-3 pr-4 font-medium">{scope.name}<span className="block font-normal text-gray-500 dark:text-slate-400">{scope.kind.replace('_',' ')}</span></td>
          <td className="py-3 pr-4">{context.myGrants.filter(grant => {
            const source = context.scopes.find(item => item.id === grant.scopeId);
            return source && (source.id === scope.id || source.kind === 'organization' || (source.kind === 'business_unit' && scope.kind === 'payroll_group' && source.businessUnitId === scope.businessUnitId));
          }).map(grant => payrollPermissionLabel(grant.permission)).join(', ') || '—'}</td>
          <td className="py-3 capitalize">{scope.mode}</td>
        </tr>)}</tbody>
      </table></div>
      {managedBus.length > 0 && <details className="mt-4 border-t border-gray-200 pt-4 dark:border-slate-700">
        <summary className="cursor-pointer text-sm font-medium text-indigo-600 dark:text-indigo-300">Add a payroll group</summary>
        <form className="mt-4 space-y-3" onSubmit={async event => {
          event.preventDefault(); setBusy(true); setGroupError(''); setGroupMessage('');
          try { await createPayrollGroupScope(selectedBu,groupName,groupReason); setGroupName(''); setGroupReason(''); setGroupMessage('Payroll group added with processing off.'); notifyPayrollAccessChanged(); }
          catch(err) { setGroupError(err instanceof Error ? err.message : 'The group could not be added.'); }
          finally { setBusy(false); }
        }}>
          <label htmlFor="payroll-group-bu" className="block text-sm font-medium">Business unit<select id="payroll-group-bu" className={fieldClass} value={selectedBu} onChange={event => setGroupBu(event.target.value)} disabled={busy}>{managedBus.map(scope => <option key={scope.id} value={scope.businessUnitId!}>{scope.name}</option>)}</select></label>
          <label htmlFor="payroll-group-name" className="block text-sm font-medium">Group name<input id="payroll-group-name" className={fieldClass} value={groupName} maxLength={120} required onChange={event => setGroupName(event.target.value)} disabled={busy} /></label>
          <label htmlFor="payroll-group-reason" className="block text-sm font-medium">Reason<input id="payroll-group-reason" className={fieldClass} value={groupReason} minLength={3} maxLength={1000} required onChange={event => setGroupReason(event.target.value)} disabled={busy} /></label>
          {groupError && <p role="alert" className="text-sm text-red-700">{groupError}</p>}{groupMessage && <p role="status" className="text-sm text-green-700">{groupMessage}</p>}
          <Button type="submit" isLoading={busy} disabled={!selectedBu || !groupName.trim() || groupReason.trim().length < 3}>Add group</Button>
        </form>
      </details>}
    </Card>}
  </div>;
}

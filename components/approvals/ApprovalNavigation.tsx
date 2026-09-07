import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useInRouterContext } from 'react-router-dom';
import { APPROVAL_CENTER } from '../../services/approvalNavigation';
export function ApprovalReturn({ onReturn, saved = false }: { onReturn?: () => void; saved?: boolean }) {
  const location = useLocation();
  const label = saved ? 'Return to Approval Center' : '← Back to Approval Center';
  const className = 'inline-flex min-h-12 items-center justify-center rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700';
  return location.pathname === APPROVAL_CENTER && onReturn
    ? <button type="button" className={className} onClick={onReturn}>{label}</button>
    : <Link className={className} to={APPROVAL_CENTER}>{label}</Link>;
}
export function ApprovalOutcome({ message, onReturn }: { message: string; onReturn?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ block: 'nearest' }); }, [message]);
  return <section ref={panel} className="my-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-slate-900 dark:border-emerald-800 dark:bg-slate-800 dark:text-white">
    <p role="status" className="mb-3 font-semibold">{message}</p><ApprovalReturn saved onReturn={onReturn} />
  </section>;
}
export default function ApprovalNavigation() {
  const location = useLocation();
  const [message, setMessage] = useState('');
  useEffect(() => { setMessage(''); }, [location.pathname]);
  useEffect(() => {
    const listener = (event: Event) => setMessage((event as CustomEvent).detail.message);
    window.addEventListener('approval-decision-saved', listener);
    return () => window.removeEventListener('approval-decision-saved', listener);
  }, []);
  const relevant = /^\/(feedback\/(cases|nte)(\/|$)|employees\/(pan|asset-management)(\/|$)|recruitment\/(requisitions|offers)(\/|$)|evaluation\/awards(\/|$)|payroll\/(leave|wfh-requests|overtime-requests|manpower-planning)(\/|$))/.test(location.pathname);
  if (!relevant) return null;
  return <div className="mb-4"><ApprovalReturn />{message && <ApprovalOutcome message={message} />}</div>;
}

function DialogReturn({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  if (location.pathname !== APPROVAL_CENTER) return null;
  return <ApprovalReturn onReturn={onClose} />;
}
export function ApprovalDialogNavigation({ onClose }: { onClose: () => void }) {
  const inRouter = useInRouterContext();
  return inRouter ? <DialogReturn onClose={onClose} /> : null;
}

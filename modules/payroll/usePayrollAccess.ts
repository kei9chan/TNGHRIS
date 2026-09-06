import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchPayrollAccess, PAYROLL_ACCESS_CHANGED, PayrollAccessContext } from './access';

export function usePayrollAccess(employeeId?: string) {
  const { user } = useAuth();
  const [context, setContext] = useState<PayrollAccessContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    // Do not retain usable permissions while revalidation is pending or failed.
    setContext(null);
    setError('');
    if (!user) { setLoading(false); return; }
    try {
      const next = await fetchPayrollAccess(employeeId);
      if (request === sequence.current) setContext(next);
    } catch (err) {
      if (request === sequence.current) setError(err instanceof Error ? err.message : 'Payroll access could not be verified.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [employeeId, user?.id]);
  useEffect(() => {
    void reload();
    const refresh = () => { void reload(); };
    window.addEventListener('focus', refresh);
    window.addEventListener(PAYROLL_ACCESS_CHANGED, refresh);
    return () => {
      ++sequence.current;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(PAYROLL_ACCESS_CHANGED, refresh);
    };
  }, [reload]);
  return { context, loading, error, reload };
}

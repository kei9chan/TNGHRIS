import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';

/** Record-level fallback only; never grants PAN creation or directory access. */
export default function AssignedPanAccess({ userId, requestId, children }: {
  userId: string;
  requestId: string | null;
  children: React.ReactElement;
}) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const check = async () => {
      try {
        // RLS also checks the authenticated account. URL IDs are never authority.
        let query = supabase.from('pans').select('id')
          .contains('routing_steps', [{ userId }]).limit(1);
        if (requestId) query = query.eq('id', requestId);
        const { data, error } = await query;
        if (!cancelled) setState(error ? 'error' : data?.length ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setState('error');
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [userId, requestId, attempt]);

  if (state === 'allowed') return children;
  if (state === 'loading') return <p role="status" className="p-6">Checking assigned PAN access…</p>;
  return <div className="p-6" role="alert">
    <h1 className="text-xl font-bold">{state === 'error' ? 'Unable to verify PAN access' : 'Access denied'}</h1>
    <p>{state === 'error' ? 'Please retry the access check.' : 'This PAN is not assigned to you, or you do not have access to it.'}</p>
    {state === 'error' && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button>}
    <a className="block mt-4" href="/approvals">Return to Approval Center</a>
  </div>;
}

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { fetchPersonalNTEPage } from '../services/nteService';
import type { NTE } from '../types';

type State = { key: string; items: NTE[]; total: number; loading: boolean; error: string };
export function usePersonalNTEs({ pendingOnly = false, page = 0, pageSize = 20 } = {}) {
  const { user } = useAuth();
  const employeeId = user?.id;
  const key = JSON.stringify([employeeId, pendingOnly, page, pageSize]);
  const [state, setState] = useState<State>({ key: '', items: [], total: 0, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true, sequence = 0;
    if (!employeeId) {
      setState({ key, items: [], total: 0, loading: false, error: '' });
      return;
    }
    const load = async () => {
      const request = ++sequence;
      setState(previous => previous.key === key
        ? { ...previous, loading: true, error: '' }
        : { key, items: [], total: 0, loading: true, error: '' });
      try {
        const result = await fetchPersonalNTEPage(employeeId, { pendingOnly, page, pageSize });
        if (active && request === sequence) setState({ key, ...result, loading: false, error: '' });
      } catch (error) {
        if (active && request === sequence) setState(previous => ({
          ...previous, key, loading: false,
          error: error instanceof Error ? error.message : 'Unable to load your NTEs.'
        }));
      }
    };
    const refreshVisible = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [employeeId, pendingOnly, page, pageSize, key, revision]);
  // Never show the previous employee's notices while a new account is loading.
  const current = state.key === key ? state : { key, items: [], total: 0, loading: !!employeeId, error: '' };
  return { ...current, refresh: () => setRevision(value => value + 1) };
}

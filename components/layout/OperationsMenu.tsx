import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getOperationsWorkspace } from '../../modules/operations/service';
import { operationsMainViews, operationsToolViews } from '../../modules/operations/navigation';
import { OpsIcon } from '../../modules/operations/ui';
import type { OpsWorkspace } from '../../modules/operations/types';

export default function OperationsMenu({ onNavigate }: { key?: React.Key; onNavigate: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const active = location.pathname.startsWith('/operations');
  const [expanded, setExpanded] = useState(active);
  const [workspace, setWorkspace] = useState<OpsWorkspace | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const view = new URLSearchParams(location.search).get('view') || 'Today';

  useEffect(() => {
    if (!expanded || !user?.id) return;
    let current = true;
    setWorkspace(null);
    setError('');
    getOperationsWorkspace('').then(data => { if (current) setWorkspace(data); })
      .catch(reason => { if (current) setError(reason.message || 'Unable to load workspace tools.'); });
    return () => { current = false; };
  }, [expanded, user?.id, attempt]);

  return <section className="mb-4">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="operations-menu-links" className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${active ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'}`}>
      <OpsIcon name="Tasks" /><span className="flex-1">Operations Station</span><span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>
    </button>
    {expanded && <nav id="operations-menu-links" aria-label="Operations menu" className="ml-3 mt-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
      {[...operationsMainViews, ...operationsToolViews(workspace)].map(name => <Link key={name} to={`/operations?view=${encodeURIComponent(name)}`} onClick={onNavigate} aria-current={active && view === name ? 'page' : undefined} className={`flex min-h-11 items-center rounded-xl px-3 py-2 text-sm ${active && view === name ? 'bg-violet-50 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
        {name === 'Today' ? 'Operations Home · Today' : name === 'Coverage' ? 'Coverage & responsibility' : name}
      </Link>)}
      {!workspace && !error && <p role="status" className="px-3 py-2 text-xs text-slate-500">Loading workspace tools…</p>}
      {error && <div role="alert" className="px-3 py-2 text-xs text-red-600"><p>{error}</p><button type="button" className="mt-2 min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Retry workspace tools</button></div>}
    </nav>}
  </section>;
}

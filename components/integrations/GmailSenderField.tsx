import React from 'react';
import { Link } from 'react-router-dom';
import { useGmailConnection } from '../../hooks/useGmailConnection';

interface Props {
  enabled?: boolean;
  className?: string;
}

const GmailSenderField: React.FC<Props> = ({ enabled = true, className = '' }) => {
  const { connection, loading, error } = useGmailConnection(enabled);
  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Send from</p>
      {loading ? (
        <p className="mt-1 text-slate-500">Checking Gmail connection…</p>
      ) : connection.connected && connection.email ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">Gmail: Connected as {connection.email}</p>
          <Link to="/integrations" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">Manage</Link>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-amber-700 dark:text-amber-300">Gmail: Not connected</p>
          <Link to="/integrations" className="font-semibold text-violet-700 hover:underline dark:text-violet-300">Connect Gmail to send</Link>
        </div>
      )}
      {(error || connection.lastError) && <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{error || connection.lastError}</p>}
    </div>
  );
};

export default GmailSenderField;


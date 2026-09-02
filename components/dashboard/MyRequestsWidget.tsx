import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import { useAuth } from '../../hooks/useAuth';
import { fetchMyRequestSummaries, MyRequestStatus, MyRequestSummary } from '../../services/myRequestsService';

const statusClass: Record<MyRequestStatus, string> = {
  Pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  Approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  Rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  Returned: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
};

const MyRequestsWidget: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MyRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadRequests = async () => {
      if (!user) {
        if (active) {
          setRequests([]);
          setLoading(false);
        }
        return;
      }

      try {
        const nextRequests = await fetchMyRequestSummaries();
        if (!active) return;
        setRequests(nextRequests);
        setError(null);
      } catch (loadError: any) {
        if (!active) return;
        setError(loadError?.message || 'Your requests could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    loadRequests();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void loadRequests();
    }, 15000);
    window.addEventListener('focus', loadRequests);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('focus', loadRequests);
    };
  }, [user?.id]);

  return (
    <Card title="My Requests">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p>{error}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => window.dispatchEvent(new Event('focus'))}>
            Retry
          </button>
        </div>
      ) : loading && requests.length === 0 ? (
        <p className="py-3 text-sm text-slate-500 dark:text-slate-300">Loading your requests…</p>
      ) : requests.length === 0 ? (
        <p className="py-3 text-sm text-slate-500 dark:text-slate-300">No submitted requests yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {requests.map(request => (
            <div key={`${request.requestType}-${request.id}`} className="grid gap-2 py-4 sm:grid-cols-[1.35fr,1fr,auto,auto] sm:items-center sm:gap-4">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{request.requestType}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 sm:whitespace-nowrap">
                {request.submittedAt.toLocaleDateString()}
              </p>
              <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[request.status]}`}>
                {request.status}
              </span>
              <Link to={request.detailLink} className="inline-flex min-h-10 items-center font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200">
                View details →
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default MyRequestsWidget;

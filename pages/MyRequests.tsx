import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import { MyRequestsList } from '../components/dashboard/MyRequestsWidget';
import { useAuth } from '../hooks/useAuth';
import { fetchMyRequestSummaries, MyRequestSummary } from '../services/myRequestsService';

const PAGE_SIZE = 20;

const MyRequests: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MyRequestSummary[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRequests(await fetchMyRequestSummaries());
      setError(null);
    } catch (loadError: any) {
      setError(loadError?.message || 'Your requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const pageCount = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const visibleRequests = useMemo(
    () => requests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, requests],
  );

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="space-y-5 pb-12 text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">My Requests</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-300">All requests submitted from your account.</p>
        </div>
        <Link to="/dashboard" className="font-semibold text-indigo-600 dark:text-indigo-300">← Dashboard</Link>
      </div>

      <Card>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
            <p>{error}</p>
            <button type="button" className="mt-2 font-semibold underline" onClick={() => void loadRequests()}>Retry</button>
          </div>
        ) : loading ? (
          <p className="py-3 text-sm text-slate-500 dark:text-slate-300">Loading your requests…</p>
        ) : requests.length === 0 ? (
          <p className="py-3 text-sm text-slate-500 dark:text-slate-300">No submitted requests yet.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-300">
              <span>{requests.length} request{requests.length === 1 ? '' : 's'}</span>
              {pageCount > 1 && <span>Page {page} of {pageCount}</span>}
            </div>
            <MyRequestsList requests={visibleRequests} />
            {pageCount > 1 && (
              <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
                <button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600">Previous</button>
                <button type="button" disabled={page === pageCount} onClick={() => setPage(current => current + 1)} className="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default MyRequests;

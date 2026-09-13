import React from 'react';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

const CHUNK_RETRY_KEY = 'tng-hris-chunk-retry-at';
const CHUNK_RETRY_WINDOW_MS = 60_000;

const isChunkLoadError = (error: Error) =>
  /(?:loading chunk|loading css chunk|dynamically imported module|importing a module script failed|failed to fetch dynamically imported module|unable to preload css)/i.test(
    error.message,
  );

const canRetryStaleBundle = () => {
  try {
    const lastAttempt = Number(sessionStorage.getItem(CHUNK_RETRY_KEY));
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < CHUNK_RETRY_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RETRY_KEY, String(Date.now()));
    return true;
  } catch {
    // A blocked storage API should never prevent the recovery screen from rendering.
    return false;
  }
};

/**
 * Lazy-loaded routes can reject when a browser is holding an older Vite
 * manifest after a deployment. Without an error boundary React unmounts the
 * entire app, leaving a blank page. Retry once for that known case, then show
 * a clear recovery screen instead of failing silently.
 */
export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('HRIS application failed to render', error, errorInfo);

    if (isChunkLoadError(error) && canRetryStaleBundle()) {
      window.setTimeout(() => window.location.reload(), 0);
    }
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isPayrollRoute = window.location.pathname.startsWith('/payroll');
    const title = isPayrollRoute ? 'Payroll could not be loaded' : 'HRIS could not be loaded';
    const description = isPayrollRoute
      ? 'The payroll page was interrupted while loading. Your account and permissions were not changed.'
      : 'This page was interrupted while loading. Your account and permissions were not changed.';

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl" role="alert">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">TNG HRIS</p>
          <h1 className="mt-3 text-2xl font-bold">{title}</h1>
          <p className="mt-3 text-slate-300">{description}</p>
          <p className="mt-3 text-sm text-slate-400">
            Reload the page to get the latest HRIS modules. If the problem continues, contact your HRIS administrator.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="rounded-lg border border-slate-600 px-4 py-3 font-semibold text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Try again
            </button>
            {isPayrollRoute && (
              <a
                href="/dashboard"
                className="rounded-lg border border-slate-600 px-4 py-3 font-semibold text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                Go to dashboard
              </a>
            )}
          </div>
        </section>
      </main>
    );
  }
}

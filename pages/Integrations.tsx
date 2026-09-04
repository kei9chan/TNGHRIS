import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../hooks/useAuth';
import { useGmailConnection } from '../hooks/useGmailConnection';
import {
  beginGmailConnection,
  disconnectGmail,
  sendGmailTestEmail,
} from '../services/gmailConnectionService';

const Integrations: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { connection, loading, error, refresh } = useGmailConnection(true);
  const [expectedEmail, setExpectedEmail] = useState(user?.email || '');
  const [emailEdited, setEmailEdited] = useState(false);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'test' | ''>('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!expectedEmail && user?.email) setExpectedEmail(user.email);
  }, [expectedEmail, user?.email]);

  useEffect(() => {
    if (!emailEdited && connection.email) setExpectedEmail(connection.email);
  }, [connection.email, emailEdited]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get('gmail');
    const callbackMessage = params.get('message');
    if (!result) return;
    setMessage({
      kind: result === 'connected' ? 'success' : 'error',
      text: callbackMessage || (result === 'connected' ? 'Gmail connected successfully.' : 'Gmail could not be connected.'),
    });
    void refresh(true);
    navigate('/integrations', { replace: true });
  }, [location.search, navigate, refresh]);

  const connect = async () => {
    setBusy('connect');
    setMessage(null);
    try {
      await beginGmailConnection(expectedEmail.trim());
    } catch (reason: any) {
      setMessage({ kind: 'error', text: reason?.message || 'Unable to open Google consent.' });
      setBusy('');
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail from HRIS sending? You will be unable to send HRIS emails until you reconnect.')) return;
    setBusy('disconnect');
    setMessage(null);
    try {
      const result = await disconnectGmail();
      await refresh(true);
      setMessage({ kind: result.warning ? 'info' : 'success', text: result.warning || 'Gmail disconnected. HRIS login and Calendar were not changed.' });
    } catch (reason: any) {
      setMessage({ kind: 'error', text: reason?.message || 'Unable to disconnect Gmail.' });
    } finally {
      setBusy('');
    }
  };

  const sendTest = async () => {
    setBusy('test');
    setMessage(null);
    try {
      const result = await sendGmailTestEmail();
      setMessage({
        kind: result.auditRecorded ? 'success' : 'info',
        text: result.auditRecorded
          ? `Test email sent from ${result.senderEmail} and recorded in HRIS audit history.`
          : `Test email sent from ${result.senderEmail}, but audit recording needs administrator attention.`,
      });
      await refresh(true);
    } catch (reason: any) {
      setMessage({ kind: 'error', text: reason?.message || 'Unable to send a Gmail test email.' });
      await refresh(true);
    } finally {
      setBusy('');
    }
  };

  const statusLabel = loading
    ? 'Checking…'
    : connection.connected && connection.email
      ? `Connected as ${connection.email}`
      : connection.status === 'error'
        ? 'Reconnect required'
        : 'Not connected';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-black text-slate-950 dark:text-white">Integrations</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">Connect services used by HRIS without changing how you sign in.</p>
      </div>

      {message && (
        <div role="status" className={`rounded-xl border p-4 text-sm font-semibold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
          {message.text}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-5 dark:border-slate-700 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600 dark:text-violet-300">Email sending</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Google Gmail</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Send authorized HRIS documents from your own Gmail or Google Workspace address.</p>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${connection.connected ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
              Gmail: {statusLabel}
            </span>
          </div>
        </div>

        <div className="grid gap-6 p-5 dark:text-slate-100 sm:p-6 lg:grid-cols-[1.2fr,.8fr]">
          <div className="space-y-4">
            <Input
              label="Google email address"
              type="email"
              value={expectedEmail}
              onChange={event => {
                setExpectedEmail(event.target.value);
                setEmailEdited(true);
              }}
              placeholder="name@company.com"
              disabled={busy !== ''}
            />
            <p className="-mt-2 text-xs text-slate-500">Google will ask you to choose and explicitly consent to this account.</p>
            {(error || connection.lastError) && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">{error || connection.lastError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void connect()} isLoading={busy === 'connect'} disabled={busy !== '' || !expectedEmail.includes('@')}>
                {connection.connected ? 'Reconnect Gmail' : 'Connect Gmail'}
              </Button>
              {connection.connected && (
                <>
                  <Button variant="secondary" onClick={() => void sendTest()} isLoading={busy === 'test'} disabled={busy !== ''}>Send test email</Button>
                  <Button variant="danger" onClick={() => void disconnect()} isLoading={busy === 'disconnect'} disabled={busy !== ''}>Disconnect Gmail</Button>
                </>
              )}
            </div>
            {connection.lastVerifiedAt && <p className="text-xs text-slate-500">Last successful Gmail verification: {new Date(connection.lastVerifiedAt).toLocaleString()}</p>}
          </div>

          <aside className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <h3 className="font-bold text-slate-900 dark:text-white">What this connection can do</h3>
            <ul className="mt-3 space-y-2">
              <li>✓ Send email from the connected account</li>
              <li>✓ Attach approved HRIS documents</li>
              <li>✓ Record Gmail delivery IDs in HRIS audit history</li>
              <li>— Cannot read, search, modify, or delete mailbox content</li>
            </ul>
            <p className="mt-4 border-t border-slate-200 pt-4 text-xs dark:border-slate-700">This uses only <code>gmail.send</code>. HRIS login and the existing Google Calendar integration remain separate and unchanged.</p>
          </aside>
        </div>
      </section>
    </div>
  );
};

export default Integrations;

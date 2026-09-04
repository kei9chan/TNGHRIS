import { useCallback, useEffect, useState } from 'react';
import {
  getGmailConnectionStatus,
  type GmailConnectionStatus,
} from '../services/gmailConnectionService';

const disconnected: GmailConnectionStatus = {
  connected: false,
  status: 'not_connected',
  email: null,
  scopes: [],
  expiry: null,
  connectedAt: null,
  lastVerifiedAt: null,
  lastError: null,
};

export const useGmailConnection = (enabled = true) => {
  const [connection, setConnection] = useState<GmailConnectionStatus>(disconnected);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const refresh = useCallback(async (force = false) => {
    if (!enabled) return disconnected;
    setLoading(true);
    setError('');
    try {
      const next = await getGmailConnectionStatus(force);
      setConnection(next);
      return next;
    } catch (reason: any) {
      setConnection(disconnected);
      setError(reason?.message || 'Unable to load the Gmail connection.');
      return disconnected;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
    const handleChange = () => void refresh(true);
    window.addEventListener('tng:gmail-connection-changed', handleChange);
    return () => window.removeEventListener('tng:gmail-connection-changed', handleChange);
  }, [enabled, refresh]);

  return { connection, loading, error, refresh };
};


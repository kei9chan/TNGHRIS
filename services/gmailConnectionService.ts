import { supabase } from './supabaseClient';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export interface GmailConnectionStatus {
  connected: boolean;
  status: 'connected' | 'revoked' | 'error' | 'not_connected';
  email: string | null;
  scopes: string[];
  expiry: string | null;
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

export interface HrisEmailAttachment {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

export type HrisEmailDocumentType =
  | 'job-offer'
  | 'offer-welcome'
  | 'candidate'
  | 'candidate-rejection'
  | 'interview'
  | 'coe'
  | 'nte'
  | 'contract'
  | 'award'
  | 'resignation-guidance';

export interface SendHrisEmailInput {
  to: string;
  subject: string;
  message: string;
  html?: string;
  attachments?: HrisEmailAttachment[];
  documentType: HrisEmailDocumentType;
  documentId: string;
}

export interface SendHrisEmailResult {
  ok: true;
  provider: 'google-gmail';
  senderEmail: string;
  messageId: string;
  threadId: string;
  auditRecorded: boolean;
}

const emptyStatus = (): GmailConnectionStatus => ({
  connected: false,
  status: 'not_connected',
  email: null,
  scopes: [],
  expiry: null,
  connectedAt: null,
  lastVerifiedAt: null,
  lastError: null,
});

let statusCache: { userId: string; value: GmailConnectionStatus; expiresAt: number } | null = null;
let statusRequest: { userId: string; promise: Promise<GmailConnectionStatus> } | null = null;

const readFunctionError = async (data: any, error: any, fallback: string) => {
  if (data?.error) return new Error(String(data.error));
  try {
    const response = error?.context as Response | undefined;
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json().catch(() => ({}));
      if (payload?.error) return new Error(String(payload.error));
    }
  } catch {
    // Use the normalized SDK error below.
  }
  return new Error(error?.message || fallback);
};

const invokeConnection = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('gmail-connection', { body });
  if (error || data?.error) throw await readFunctionError(data, error, 'Unable to reach the Gmail connection service.');
  return data;
};

export const invalidateGmailConnectionStatus = () => {
  statusCache = null;
  statusRequest = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tng:gmail-connection-changed'));
};

export const getGmailConnectionStatus = async (force = false): Promise<GmailConnectionStatus> => {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return emptyStatus();
  if (force) statusCache = null;
  if (statusCache?.userId === userId && statusCache.expiresAt > Date.now()) return statusCache.value;
  if (statusRequest?.userId === userId) return statusRequest.promise;

  const request = invokeConnection({ action: 'status' })
    .then(async data => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user?.id !== userId) return emptyStatus();
      const value: GmailConnectionStatus = {
        ...emptyStatus(),
        ...data,
        connected: data?.connected === true && data?.status === 'connected',
        scopes: Array.isArray(data?.scopes) ? data.scopes : [],
      };
      statusCache = { userId, value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .finally(() => {
      if (statusRequest?.promise === request) statusRequest = null;
    });
  statusRequest = { userId, promise: request };
  return request;
};

export const beginGmailConnection = async (expectedEmail: string) => {
  const data = await invokeConnection({ action: 'start', expectedEmail });
  if (!data?.authorizationUrl || !String(data.authorizationUrl).startsWith('https://accounts.google.com/')) {
    throw new Error('Google authorization could not be started safely.');
  }
  window.location.assign(String(data.authorizationUrl));
};

export const disconnectGmail = async () => {
  const data = await invokeConnection({ action: 'disconnect' });
  invalidateGmailConnectionStatus();
  return data as GmailConnectionStatus & { warning?: string | null };
};

export const sendGmailTestEmail = async () => {
  const data = await invokeConnection({ action: 'test' });
  invalidateGmailConnectionStatus();
  return data as SendHrisEmailResult;
};

export const requireConnectedGmail = async (force = false) => {
  const connection = await getGmailConnectionStatus(force);
  if (!connection.connected || !connection.email || !connection.scopes.includes(GMAIL_SEND_SCOPE)) {
    throw new Error(connection.lastError || 'Connect Gmail to send this HRIS email.');
  }
  return connection;
};

export const sendHrisEmail = async (input: SendHrisEmailInput): Promise<SendHrisEmailResult> => {
  await requireConnectedGmail();
  const { data, error } = await supabase.functions.invoke('send-hris-email', { body: input });
  if (error || !data?.ok) throw await readFunctionError(data, error, 'Unable to send this HRIS email through Gmail.');
  return data as SendHrisEmailResult;
};

import { supabase } from './supabaseClient';

export interface RejectionEmailInput {
  applicationId: string;
  subject: string;
  message: string;
  rejectionReason: string;
}

export interface RejectionOutcome {
  application: any;
  warning?: string;
}

export const rejectApplicationWithEmail = async (input: RejectionEmailInput): Promise<RejectionOutcome> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Your session is no longer valid. Please sign in again.');

  const response = await fetch('/api/reject-application', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Unable to reject the applicant.');
  return { application: payload.application, warning: payload.warning };
};

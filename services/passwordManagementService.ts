import { supabase } from './supabaseClient';

export type PasswordManagementAction = 'send_reset_link';

interface PasswordManagementRequest {
  action: PasswordManagementAction;
  targetUserId: string;
}

export interface PasswordManagementResult {
  ok: boolean;
  delivered?: boolean;
  warning?: string;
}

const throwFunctionError = async (error: any): Promise<never> => {
  let payload: any;
  try {
    payload = await error?.context?.json?.();
  } catch { /* The response may not contain JSON. Preserve the original function error below. */ }
  if (payload?.error) throw new Error(payload.error);
  throw error instanceof Error ? error : new Error('The password service could not complete the request.');
};

export const requestPasswordReset = async (email: string) => {
  const { data, error } = await supabase.functions.invoke('password-management', {
    body: {
      action: 'request_reset',
      email: email.trim().toLowerCase(),
      redirectTo: `${window.location.origin}/reset-password`,
    },
  });
  if (error) return throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data;
};

export const manageUserPassword = async (request: PasswordManagementRequest): Promise<PasswordManagementResult> => {
  const { data, error } = await supabase.functions.invoke('password-management', {
    body: {
      ...request,
      redirectTo: `${window.location.origin}/reset-password`,
    },
  });
  if (error) return throwFunctionError(error);
  if (data?.error) throw new Error(data.error);
  return data as PasswordManagementResult;
};

export const getAccountAccessDiagnostics = async (userId?: string) => {
  const { data, error } = await supabase.rpc('get_account_access_diagnostics', { p_user_id: userId || null });
  if (error) throw new Error('Account diagnostics could not be loaded.');
  return data as any[];
};

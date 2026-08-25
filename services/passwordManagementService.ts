import { supabase } from './supabaseClient';

export type PasswordManagementAction = 'send_reset_link' | 'set_temporary_password';

interface PasswordManagementRequest {
  action: PasswordManagementAction;
  targetUserId: string;
  temporaryPassword?: string;
}

export const requestPasswordReset = async (email: string) => {
  const { data, error } = await supabase.functions.invoke('password-management', {
    body: {
      action: 'request_reset',
      email: email.trim().toLowerCase(),
      redirectTo: `${window.location.origin}/reset-password`,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

export const manageUserPassword = async (request: PasswordManagementRequest) => {
  const { data, error } = await supabase.functions.invoke('password-management', {
    body: {
      ...request,
      redirectTo: `${window.location.origin}/reset-password`,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

export const generateTemporaryPassword = () => {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*?';
  const all = uppercase + lowercase + numbers + symbols;
  const random = (characters: string) => characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length];
  const required = [random(uppercase), random(lowercase), random(numbers), random(symbols)];
  const remainder = Array.from({ length: 12 }, () => random(all));
  return [...required, ...remainder]
    .map(value => ({ value, order: crypto.getRandomValues(new Uint32Array(1))[0] }))
    .sort((left, right) => left.order - right.order)
    .map(item => item.value)
    .join('');
};

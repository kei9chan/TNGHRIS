import { supabase } from '../../services/supabaseClient';
import type { OpsWorkspace } from './types';
export async function operationsRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const getOperationsWorkspace = (unit: string) => operationsRpc<OpsWorkspace>('ops_workspace', {p_unit: unit || null});

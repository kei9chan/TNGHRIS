import { supabase } from './supabaseClient';
import { ApproverConfigs, GMApproverConfig, BODApproverConfig } from '../types';

// ---------------------------------------------------------------------------
// Default Configs
// ---------------------------------------------------------------------------
const DEFAULT_GM: GMApproverConfig = { user_id: null, user_name: null };
const DEFAULT_BOD: BODApproverConfig = { user_ids: [], user_names: [] };

// ---------------------------------------------------------------------------
// Fetch all approver configs
// ---------------------------------------------------------------------------
export const fetchApproverConfigs = async (): Promise<ApproverConfigs> => {
  const { data, error } = await supabase
    .from('approver_configs')
    .select('config_key, config_value');

  if (error || !data) {
    console.warn('Failed to load approver configs, using defaults', error);
    return { gmApprover: DEFAULT_GM, bodApprovers: DEFAULT_BOD };
  }

  let gmApprover = DEFAULT_GM;
  let bodApprovers = DEFAULT_BOD;

  for (const row of data) {
    if (row.config_key === 'gm_approver') {
      gmApprover = row.config_value as GMApproverConfig;
    } else if (row.config_key === 'bod_approvers') {
      bodApprovers = row.config_value as BODApproverConfig;
    }
  }

  return { gmApprover, bodApprovers };
};

// ---------------------------------------------------------------------------
// Save GM Approver
// ---------------------------------------------------------------------------
export const saveGMApprover = async (config: GMApproverConfig): Promise<void> => {
  const { error } = await supabase
    .from('approver_configs')
    .upsert({
      config_key: 'gm_approver',
      config_value: config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'config_key' });

  if (error) throw new Error(error.message || 'Failed to save GM approver config');
};

// ---------------------------------------------------------------------------
// Save BOD Approvers
// ---------------------------------------------------------------------------
export const saveBODApprovers = async (config: BODApproverConfig): Promise<void> => {
  const { error } = await supabase
    .from('approver_configs')
    .upsert({
      config_key: 'bod_approvers',
      config_value: config,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'config_key' });

  if (error) throw new Error(error.message || 'Failed to save BOD approvers config');
};

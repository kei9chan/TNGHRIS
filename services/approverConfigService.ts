import { supabase } from './supabaseClient';
import {
  ApproverConfigs,
  COEApprovalAuthority,
  COEApprovalConfig,
  ConditionalTimeApprovalConfig,
  GMApproverConfig,
  BODApproverConfig,
  Role,
} from '../types';

// ---------------------------------------------------------------------------
// Default Configs
// ---------------------------------------------------------------------------
const DEFAULT_GM: GMApproverConfig = { user_id: null, user_name: null };
const DEFAULT_BOD: BODApproverConfig = { user_ids: [], user_names: [] };
export const DEFAULT_COE_APPROVAL: COEApprovalConfig = { authority: COEApprovalAuthority.HRManager };
export const DEFAULT_CONDITIONAL_TIME_APPROVALS: ConditionalTimeApprovalConfig = {
  user_ids: [],
  user_names: [],
  required_user_ids: [],
  required_bod_approvals: 1,
  leave_days_per_remaining_month: 1,
  wfh_days_per_month: 4,
  weekly_total_hours: 50,
  valid: false,
  invalid_reason: 'At least one active BOD approver must be configured.',
};

// ---------------------------------------------------------------------------
// Fetch all approver configs
// ---------------------------------------------------------------------------
export const fetchApproverConfigs = async (): Promise<ApproverConfigs> => {
  const { data, error } = await supabase
    .from('approver_configs')
    .select('config_key, config_value');

  if (error || !data) {
    console.warn('Failed to load approver configs, using defaults', error);
    return {
      gmApprover: DEFAULT_GM,
      bodApprovers: DEFAULT_BOD,
      coeApproval: DEFAULT_COE_APPROVAL,
      conditionalTimeApprovals: DEFAULT_CONDITIONAL_TIME_APPROVALS,
    };
  }

  let gmApprover = DEFAULT_GM;
  let bodApprovers = DEFAULT_BOD;
  let coeApproval = DEFAULT_COE_APPROVAL;
  let conditionalTimeApprovals = DEFAULT_CONDITIONAL_TIME_APPROVALS;

  for (const row of data) {
    if (row.config_key === 'gm_approver') {
      gmApprover = row.config_value as GMApproverConfig;
    } else if (row.config_key === 'bod_approvers') {
      bodApprovers = row.config_value as BODApproverConfig;
    } else if (row.config_key === 'coe_approval_authority') {
      const authority = row.config_value?.authority;
      if (Object.values(COEApprovalAuthority).includes(authority)) {
        coeApproval = { authority };
      }
    } else if (row.config_key === 'conditional_time_approvals') {
      conditionalTimeApprovals = { ...DEFAULT_CONDITIONAL_TIME_APPROVALS, ...(row.config_value as ConditionalTimeApprovalConfig) };
    }
  }

  const { data: validated } = await supabase.rpc('get_conditional_time_approval_config');
  if (validated) conditionalTimeApprovals = { ...conditionalTimeApprovals, ...(validated as ConditionalTimeApprovalConfig) };
  const { data: configuredCoeAuthority, error: coeAuthorityError } = await supabase.rpc('get_coe_approval_authority');
  if (!coeAuthorityError && Object.values(COEApprovalAuthority).includes(configuredCoeAuthority as COEApprovalAuthority)) {
    coeApproval = { authority: configuredCoeAuthority as COEApprovalAuthority };
  }
  return { gmApprover, bodApprovers, coeApproval, conditionalTimeApprovals };
};

export const fetchCOEApprovalAuthority = async (): Promise<COEApprovalAuthority> => {
  const { data, error } = await supabase.rpc('get_coe_approval_authority');
  if (error) throw new Error(error.message || 'Failed to load COE approval authority');
  if (!Object.values(COEApprovalAuthority).includes(data as COEApprovalAuthority)) {
    throw new Error('The COE approval authority configuration is invalid.');
  }
  return data as COEApprovalAuthority;
};

export const saveCOEApprovalAuthority = async (authority: COEApprovalAuthority): Promise<COEApprovalConfig> => {
  const { data, error } = await supabase.rpc('save_coe_approval_authority', {
    p_authority: authority,
  });
  if (error) throw new Error(error.message || 'Failed to save COE approval authority');
  const savedAuthority = (data as any)?.authority;
  if (!Object.values(COEApprovalAuthority).includes(savedAuthority as COEApprovalAuthority)) {
    throw new Error('The saved COE approval authority configuration is invalid.');
  }
  return { authority: savedAuthority as COEApprovalAuthority };
};

export const getCOEApprovalRoles = (authority: COEApprovalAuthority): Role[] => {
  if (authority === COEApprovalAuthority.HRStaff) return [Role.HRStaff];
  if (authority === COEApprovalAuthority.HRManagerOrHRStaff) return [Role.HRManager, Role.HRStaff];
  return [Role.HRManager];
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

export const saveConditionalTimeApprovals = async (
  config: ConditionalTimeApprovalConfig,
  changeNote: string,
): Promise<ConditionalTimeApprovalConfig> => {
  const { data, error } = await supabase.rpc('save_conditional_time_approval_config', {
    p_config: config,
    p_change_note: changeNote,
  });
  if (error) throw new Error(error.message || 'Failed to save conditional approval routing');
  return { ...DEFAULT_CONDITIONAL_TIME_APPROVALS, ...(data as ConditionalTimeApprovalConfig) };
};

export const processTimeRequestApproval = async (
  requestType: 'leave' | 'wfh' | 'overtime',
  requestId: string,
  decision: 'approve' | 'reject' | 'return',
  note?: string,
) => {
  const { data, error } = await supabase.rpc('process_time_request_approval', {
    p_request_type: requestType,
    p_request_id: requestId,
    p_decision: decision,
    p_note: note || null,
  });
  if (error) throw new Error(error.message || 'Failed to process approval');
  return data;
};

export const sendConditionalApprovalEmails = async (
  requestType: 'leave' | 'wfh' | 'overtime',
  requestId: string,
) => {
  const { data, error } = await supabase.rpc('get_time_approval_email_payload', {
    p_request_type: requestType,
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message || 'Could not prepare approval email');
  const payload = data as any;
  const openUrl = `${window.location.origin}${payload.link}`;
  const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
  const managerStage = ['Pending', 'PendingGM', 'WFH_PENDING_DEPT_HEAD_APPROVAL', 'WFH_PENDING_GM_APPROVAL', 'Submitted'].includes(payload.status);
  await Promise.all((payload.recipients || []).map(async (recipient: any) => {
    const threshold = payload.context?.reason || 'Configured threshold exceeded';
    const message = `${payload.employeeName} submitted a ${payload.requestLabel} requiring your approval. ${threshold} Open: ${openUrl}`;
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.email,
        subject: `[TNG HRIS] ${payload.requestLabel} requires your approval`,
        message,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Approval required</h2><p><b>Employee:</b> ${escapeHtml(payload.employeeName)}</p><p><b>Request:</b> ${escapeHtml(payload.requestLabel)}</p><p><b>Dates / duration:</b> ${escapeHtml(payload.requestDates)}</p><p><b>Business unit / department:</b> ${escapeHtml(payload.businessUnit)} / ${escapeHtml(payload.department)}</p><p><b>Threshold calculation:</b> ${escapeHtml(threshold)}</p>${managerStage ? '' : '<p><b>Manager recommendation:</b> Approved — proceed to final review</p>'}<p><b>Status:</b> ${managerStage ? 'Pending Direct Manager Review' : 'Pending BOD Final Approval'}</p><p><a href="${escapeHtml(openUrl)}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Open Request</a></p></div>`,
      }),
    });
    if (!response.ok) throw new Error(`Approval email failed for ${recipient.email}`);
  }));
};

import { supabase } from './supabaseClient';

export type AssetApprovalStage = 'DIRECT_MANAGER' | 'BOD' | 'COMPLETED' | 'REJECTED';

export interface AssetApprovalQueueItem {
  requestId: string;
  employeeId: string;
  employeeName: string;
  assetDescription: string;
  requestedAt: Date;
  businessUnitId?: string;
  departmentId?: string;
  approvalStage: AssetApprovalStage;
  currentStep: string;
  requiredBodApprovals: 1 | 2;
  bodApprovalCount: number;
  approvalProgress: string;
  isActionable: boolean;
  viewerActionStatus?: string;
  approvalIssue?: string;
}

export interface AssetApprovalHistoryEntry {
  id: string;
  actorId?: string;
  actorName?: string;
  actorRole: string;
  stage: string;
  action: string;
  comments?: string;
  createdAt: string;
}

export interface AssetBodApproval {
  approverId: string;
  approverName: string;
  status: string;
  actedAt?: string;
  comments?: string;
}

export interface AssetApprovalDetail {
  request: {
    id: string;
    employeeId: string;
    employeeName: string;
    assetDescription: string;
    justification: string;
    status: string;
    requestedAt: string;
    approvalStage: AssetApprovalStage;
    currentStep: string;
    managerId: string;
    managerName: string;
    managerApprovedBy?: string;
    managerApprovedAt?: string;
    requiredBodApprovals: 1 | 2;
    bodApprovalCount: number;
    approvalProgress: string;
    approvalIssue?: string;
    rejectionReason?: string;
    approvedAt?: string;
    rejectedAt?: string;
    businessUnitId?: string;
    departmentId?: string;
  };
  canAct: boolean;
  viewerActionStatus?: string;
  viewerStage?: string;
  bodApprovals: AssetBodApproval[];
  history: AssetApprovalHistoryEntry[];
}

export interface AssetApprovalConfig {
  requiredBodApprovals: 1 | 2;
  activeBodCount: number;
}

const messageFor = (error: { message?: string } | null, fallback: string) => error?.message || fallback;

export const fetchMyAssetApprovalQueue = async (): Promise<AssetApprovalQueueItem[]> => {
  const { data, error } = await supabase.rpc('get_my_asset_request_approval_queue');
  if (error) throw new Error(messageFor(error, 'Unable to load Asset Request approvals.'));
  return (data || []).map((row: any) => ({
    requestId: row.request_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || 'Employee',
    assetDescription: row.asset_description || 'Asset',
    requestedAt: new Date(row.requested_at),
    businessUnitId: row.business_unit_id || undefined,
    departmentId: row.department_id || undefined,
    approvalStage: row.approval_stage,
    currentStep: row.current_step,
    requiredBodApprovals: Number(row.required_bod_approvals) as 1 | 2,
    bodApprovalCount: Number(row.bod_approval_count || 0),
    approvalProgress: row.approval_progress,
    isActionable: Boolean(row.is_actionable),
    viewerActionStatus: row.viewer_action_status || undefined,
    approvalIssue: row.approval_issue || undefined,
  }));
};

export const fetchAssetApprovalDetail = async (requestId: string): Promise<AssetApprovalDetail> => {
  const { data, error } = await supabase.rpc('get_asset_request_approval_detail', { p_request_id: requestId });
  if (error) throw new Error(messageFor(error, 'Unable to load the Asset Request approval.'));
  return data as AssetApprovalDetail;
};

export const processAssetApproval = async (
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  comments: string,
): Promise<AssetApprovalDetail> => {
  const { data, error } = await supabase.rpc('process_asset_request_approval', {
    p_request_id: requestId,
    p_action: action,
    p_comments: comments.trim() || null,
  });
  if (error) throw new Error(messageFor(error, 'Unable to process the Asset Request approval.'));
  return data as AssetApprovalDetail;
};

export const fetchAssetApprovalConfig = async (): Promise<AssetApprovalConfig> => {
  const { data, error } = await supabase.rpc('get_asset_request_approval_config');
  if (error) throw new Error(messageFor(error, 'Unable to load Asset Request approval settings.'));
  return {
    requiredBodApprovals: Number(data?.required_bod_approvals || 2) as 1 | 2,
    activeBodCount: Number(data?.active_bod_count || 0),
  };
};

export const saveAssetApprovalConfig = async (requiredBodApprovals: 1 | 2): Promise<AssetApprovalConfig> => {
  const { data, error } = await supabase.rpc('save_asset_request_approval_config', {
    p_required_bod_approvals: requiredBodApprovals,
  });
  if (error) throw new Error(messageFor(error, 'Unable to save Asset Request approval settings.'));
  return {
    requiredBodApprovals: Number(data?.required_bod_approvals || requiredBodApprovals) as 1 | 2,
    activeBodCount: Number(data?.active_bod_count || 0),
  };
};

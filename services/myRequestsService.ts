import { supabase } from './supabaseClient';

export type MyRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned';

export interface MyRequestSummary {
  id: string;
  requestType: string;
  submittedAt: Date;
  status: MyRequestStatus;
  detailLink: string;
  currentStage?: string;
  progressLabel?: string;
}

type MyRequestSummaryRow = {
  id: string;
  request_type: string;
  submitted_at: string;
  status: MyRequestStatus;
  detail_link: string;
  current_stage?: string | null;
  progress_label?: string | null;
};

export const fetchMyRequestSummaries = async (): Promise<MyRequestSummary[]> => {
  let { data, error } = await supabase.rpc('get_my_request_summaries_v2');
  if (error && (error.code === 'PGRST202' || /get_my_request_summaries_v2/i.test(error.message || ''))) {
    const fallback = await supabase.rpc('get_my_request_summaries');
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw new Error(error.message || 'Failed to load your requests');

  return ((data || []) as MyRequestSummaryRow[]).map(row => ({
    id: row.id,
    requestType: row.request_type,
    submittedAt: new Date(row.submitted_at),
    status: row.status,
    detailLink: row.detail_link,
    currentStage: row.current_stage || undefined,
    progressLabel: row.progress_label || undefined,
  }));
};

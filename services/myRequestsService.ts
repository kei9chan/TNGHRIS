import { supabase } from './supabaseClient';

export type MyRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned';

export interface MyRequestSummary {
  id: string;
  requestType: string;
  submittedAt: Date;
  status: MyRequestStatus;
  detailLink: string;
}

type MyRequestSummaryRow = {
  id: string;
  request_type: string;
  submitted_at: string;
  status: MyRequestStatus;
  detail_link: string;
};

export const fetchMyRequestSummaries = async (): Promise<MyRequestSummary[]> => {
  const { data, error } = await supabase.rpc('get_my_request_summaries');
  if (error) throw new Error(error.message || 'Failed to load your requests');

  return ((data || []) as MyRequestSummaryRow[]).map(row => ({
    id: row.id,
    requestType: row.request_type,
    submittedAt: new Date(row.submitted_at),
    status: row.status,
    detailLink: row.detail_link,
  }));
};

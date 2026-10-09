import { supabase } from './supabaseClient';
import { Offer } from '../types';
import { OfferApprovalProgress } from './offerApprovalProgress';

export const fetchOfferApprovalProgress = async (offers: Offer[]): Promise<Record<string, OfferApprovalProgress>> => {
  const ids = [...new Set(offers.filter(offer => offer.approvalStatus === 'Pending Approval').map(offer => offer.approvalRequestId).filter(Boolean))];
  if (!ids.length) return {};
  // The authorized summary includes all stage decisions for packet participants.
  const { data, error } = await supabase.rpc('get_job_offer_approval_progress', { p_request_ids: ids });
  if (error) throw error;
  return Object.fromEntries((data || []).map(request => [request.request_id, request.progress as OfferApprovalProgress]));
};

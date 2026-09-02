import { Offer, OfferStatus } from '../types';
import { mapJobOfferRow } from './jobOfferMapper';
import { supabase } from './supabaseClient';

const TERMINAL_STATUSES = [OfferStatus.Declined, OfferStatus.Expired];
const CURRENT_DB_STATUSES = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Signed', 'Accepted and Signed', 'Converted'];

const statusRank: Record<string, number> = {
  [OfferStatus.AcceptedAndSigned]: 70,
  [OfferStatus.Signed]: 70,
  [OfferStatus.Accepted]: 65,
  Converted: 60,
  [OfferStatus.Viewed]: 50,
  [OfferStatus.Sent]: 40,
  [OfferStatus.Draft]: 30,
  [OfferStatus.Declined]: 10,
  [OfferStatus.Expired]: 0,
};

export const isPublishedOffer = (offer?: Offer | null) => !!offer && [
  OfferStatus.Sent,
  OfferStatus.Viewed,
  OfferStatus.Accepted,
  OfferStatus.Signed,
  OfferStatus.AcceptedAndSigned,
  'Converted',
].includes(offer.status as string);

export const isCompletedOffer = (offer?: Offer | null) => !!offer && [
  OfferStatus.Accepted,
  OfferStatus.Signed,
  OfferStatus.AcceptedAndSigned,
  'Converted',
].includes(offer.status as string);

export const offerWorkspaceStatus = (offer?: Offer | null) => {
  if (!offer || TERMINAL_STATUSES.includes(offer.status)) return 'No Offer';
  if (isCompletedOffer(offer)) return 'Accepted & Signed';
  return offer.status;
};

export const candidateOfferUrl = (offer: Pick<Offer, 'secureToken'>, origin = window.location.origin) =>
  offer.secureToken ? `${origin}/offer/${offer.secureToken}` : '';

export const selectCurrentOffer = (offers: Offer[], applicationId: string) => offers
  .filter(offer => offer.applicationId === applicationId && !TERMINAL_STATUSES.includes(offer.status))
  .sort((left, right) => {
    const rank = (statusRank[right.status] || 0) - (statusRank[left.status] || 0);
    if (rank) return rank;
    return (right.lastSavedAt?.getTime() || right.sentAt?.getTime() || 0) - (left.lastSavedAt?.getTime() || left.sentAt?.getTime() || 0);
  })[0] || null;

const payloadForOffer = (offer: Offer, userId?: string) => ({
  application_id: offer.applicationId,
  offer_number: offer.offerNumber || `OFFER-${Date.now().toString().slice(-6)}`,
  base_pay: offer.basePay,
  allowance_json: offer.allowanceJSON ? JSON.parse(offer.allowanceJSON) : {},
  start_date: offer.startDate ? new Date(offer.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  probation_months: offer.probationMonths,
  employment_type: offer.employmentType,
  status: offer.status,
  reporting_to: offer.reportingTo || null,
  job_description: offer.jobDescription || null,
  offer_details: offer.offerDetails || {},
  draft_step: offer.draftStep || 1,
  offer_expiration_date: offer.offerExpirationDate ? new Date(offer.offerExpirationDate).toISOString().slice(0, 10) : null,
  logo_url: offer.logoUrl || null,
  logo_path: offer.logoPath || null,
  last_saved_at: new Date().toISOString(),
  recipient_email: offer.recipientEmail || null,
  email_subject: offer.emailSubject || null,
  email_message: offer.emailMessage || null,
  require_signature: offer.requireSignature !== false,
  offer_template_id: offer.offerTemplateId || null,
  offer_template_name: offer.offerTemplateName || null,
  offer_template_snapshot: offer.offerTemplateSnapshot || {},
  ...(offer.id ? {} : { created_by_user_id: userId || null }),
});

export const saveOfferDraft = async (offer: Offer, userId?: string): Promise<{ offer: Offer; created: boolean }> => {
  const payload = payloadForOffer(offer, userId);
  if (offer.id) {
    const { data, error } = await supabase.from('job_offers').update(payload).eq('id', offer.id).select().single();
    if (error) throw error;
    return { offer: mapJobOfferRow(data), created: false };
  }

  const { data: existing, error: existingError } = await supabase
    .from('job_offers')
    .select('*')
    .eq('application_id', offer.applicationId)
    .in('status', CURRENT_DB_STATUSES)
    .order('updated_at', { ascending: false });
  if (existingError) throw existingError;
  const current = selectCurrentOffer((existing || []).map(mapJobOfferRow), offer.applicationId);
  if (current && current.status !== OfferStatus.Draft) {
    throw new Error('This applicant already has a published offer. Open the live offer instead of creating another one.');
  }
  if (current) {
    const { data, error } = await supabase.from('job_offers').update(payload).eq('id', current.id).select().single();
    if (error) throw error;
    return { offer: mapJobOfferRow(data), created: false };
  }
  const { data, error } = await supabase.from('job_offers').insert(payload).select().single();
  if (error) throw error;
  return { offer: mapJobOfferRow(data), created: true };
};

interface SendOfferInput {
  offer: Offer;
  userId?: string;
  recipient: string;
  subject: string;
  message: string;
  previewHtml: string;
}

export const sendApprovedOffer = async ({ offer, userId, recipient, subject, message, previewHtml }: SendOfferInput): Promise<{ offer: Offer; provider: string; deliveryError: string }> => {
  if (!recipient) throw new Error('The candidate email address is missing.');
  const { offer: draft } = await saveOfferDraft({ ...offer, status: OfferStatus.Draft, recipientEmail: recipient, emailSubject: subject, emailMessage: message }, userId);
  if (draft.approvalStatus !== 'Approved') throw new Error('This offer must complete the existing approval workflow before it can be sent.');
  if (!draft.secureToken) throw new Error('Unable to create the secure candidate link. Save the draft and retry.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const secureLink = candidateOfferUrl(draft);
  const activatedAt = new Date().toISOString();
  const sendingDetails = { ...(draft.offerDetails || {}), emailDelivery: { status: 'sending', attemptedAt: activatedAt } };
  const { data: activatedRow, error: activationError } = await supabase.from('job_offers').update({
    status: OfferStatus.Sent,
    sent_at: activatedAt,
    sent_by_user_id: userId || null,
    last_saved_at: activatedAt,
    recipient_email: recipient,
    email_subject: subject.trim(),
    email_message: message.trim(),
    require_signature: offer.requireSignature !== false,
    offer_details: sendingDetails,
  }).eq('id', draft.id).eq('status', OfferStatus.Draft).eq('approval_status', 'Approved').select().single();
  if (activationError || !activatedRow) throw new Error(`Unable to activate the secure offer link: ${activationError?.message || 'The offer is not approved or is no longer a draft.'}`);

  const html = `${previewHtml}<p style="margin-top:24px"><a href="${secureLink}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">View and Respond to Offer</a></p><p style="color:#64748b;font-size:12px">This is a private link intended for the named recipient.</p>`;
  const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-recruitment-email', {
    body: { to: recipient, subject: subject.trim(), message: `${message.trim()}\n\nReview your offer: ${secureLink}`, html, category: 'job-offer' },
  });
  let provider = emailResult?.ok ? 'google-gmail' : '';
  let deliveryError = '';
  if (!provider) {
    let googleMessage = emailResult?.error;
    if (!googleMessage) {
      try { googleMessage = (await emailError?.context?.json?.())?.error; } catch { /* response body unavailable */ }
    }
    try {
      const response = await fetch('/api/recruitment-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` },
        body: JSON.stringify({ to: recipient, subject: subject.trim(), message: `${message.trim()}\n\nReview your offer: ${secureLink}`, html }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Email service returned HTTP ${response.status}.`);
      provider = 'existing-email-service';
    } catch (fallbackError: any) {
      deliveryError = [googleMessage || emailError?.message, fallbackError?.message].filter(Boolean).join(' Existing email service fallback: ');
    }
  }

  const sentAt = new Date().toISOString();
  const activatedOffer = mapJobOfferRow(activatedRow);
  const deliveryDetails = { ...(activatedOffer.offerDetails || {}), emailDelivery: provider
    ? { status: 'sent', provider, attemptedAt: activatedAt, sentAt }
    : { status: 'failed', attemptedAt: activatedAt, error: deliveryError || 'Email delivery failed.' } };
  const { data, error } = await supabase.from('job_offers').update({ last_saved_at: sentAt, offer_details: deliveryDetails }).eq('id', draft.id).select().single();
  if (error) throw new Error(`The secure link is live, but delivery status could not be recorded: ${error.message}`);
  return { offer: mapJobOfferRow(data), provider, deliveryError };
};

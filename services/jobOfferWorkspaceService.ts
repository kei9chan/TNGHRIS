import { Offer, OfferStatus } from '../types';
import { mapJobOfferRow } from './jobOfferMapper';
import { supabase } from './supabaseClient';
import { requireConnectedGmail, sendHrisEmail, type HrisEmailAttachment } from './gmailConnectionService';

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
  employment_type_custom_name: offer.employmentTypeCustomName || null,
  employment_end_date: offer.employmentEndDate ? new Date(offer.employmentEndDate).toISOString().slice(0, 10) : null,
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

export const createOfferRevision = async (offerId: string): Promise<Offer> => {
  const { data, error } = await supabase.rpc('create_job_offer_revision', { p_offer_id: offerId });
  if (error) throw error;
  if (!data) throw new Error('The revised offer draft could not be created.');
  return mapJobOfferRow(data);
};

export const saveOfferDraft = async (offer: Offer, userId?: string): Promise<{ offer: Offer; created: boolean }> => {
  if (offer.id && isPublishedOffer(offer)) {
    throw new Error('Published offer content cannot be edited. Create a revised version instead.');
  }
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
  attachments: HrisEmailAttachment[];
}

export const sendApprovedOffer = async ({ offer, userId, recipient, subject, message, previewHtml, attachments }: SendOfferInput): Promise<{ offer: Offer; provider: string; deliveryError: string }> => {
  if (!recipient) throw new Error('The candidate email address is missing.');
  // Fail before activating the secure offer when the sender has no usable
  // Gmail connection. The Edge Function repeats this check server-side.
  await requireConnectedGmail(true);
  let draft: Offer;
  if (offer.id && [OfferStatus.Sent, OfferStatus.Viewed].includes(offer.status)) {
    const { data, error } = await supabase.from('job_offers').select('*').eq('id', offer.id).in('status', [OfferStatus.Sent, OfferStatus.Viewed]).single();
    if (error || !data) throw new Error(`Unable to reload the published offer: ${error?.message || 'Offer not found.'}`);
    draft = mapJobOfferRow(data);
  } else {
    ({ offer: draft } = await saveOfferDraft({ ...offer, status: OfferStatus.Draft, recipientEmail: recipient, emailSubject: subject, emailMessage: message }, userId));
  }
  if (draft.approvalStatus !== 'Approved') throw new Error('This offer must complete the existing approval workflow before it can be sent.');
  if (!draft.secureToken) throw new Error('Unable to create the secure candidate link. Save the draft and retry.');

  const secureLink = candidateOfferUrl(draft);
  const activatedAt = new Date().toISOString();
  const sendingDetails = { ...(draft.offerDetails || {}), emailDelivery: { status: 'sending', attemptedAt: activatedAt } };
  const activationQuery = supabase.from('job_offers').update({
    status: draft.status === OfferStatus.Draft ? OfferStatus.Sent : draft.status,
    sent_at: draft.sentAt?.toISOString() || activatedAt,
    sent_by_user_id: userId || null,
    last_saved_at: activatedAt,
    recipient_email: recipient,
    email_subject: subject.trim(),
    email_message: message.trim(),
    require_signature: draft.requireSignature !== false,
    offer_details: sendingDetails,
  }).eq('id', draft.id).eq('approval_status', 'Approved');
  const { data: activatedRow, error: activationError } = draft.status === OfferStatus.Draft
    ? await activationQuery.eq('status', OfferStatus.Draft).select().single()
    : await activationQuery.in('status', [OfferStatus.Sent, OfferStatus.Viewed]).select().single();
  if (activationError || !activatedRow) throw new Error(`Unable to activate the secure offer link: ${activationError?.message || 'The offer is not approved or is no longer a draft.'}`);

  const html = `${previewHtml}<p style="margin-top:24px"><a href="${secureLink}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">View and Respond to Offer</a></p><p style="color:#64748b;font-size:12px">This is a private link intended for the named recipient.</p>`;
  let provider = '';
  let deliveryError = '';
  let gmailResult: Awaited<ReturnType<typeof sendHrisEmail>> | null = null;
  try {
    gmailResult = await sendHrisEmail({
      to: recipient,
      subject: subject.trim(),
      message: `${message.trim()}\n\nReview your offer: ${secureLink}`,
      html,
      attachments,
      documentType: 'job-offer',
      documentId: draft.id,
    });
    provider = gmailResult.provider;
  } catch (sendError: any) {
    deliveryError = sendError?.message || 'Gmail delivery failed.';
  }

  const sentAt = new Date().toISOString();
  const activatedOffer = mapJobOfferRow(activatedRow);
  const deliveryDetails = { ...(activatedOffer.offerDetails || {}), emailDelivery: provider
    ? { status: 'sent', provider, attemptedAt: activatedAt, sentAt, senderEmail: gmailResult?.senderEmail, gmailMessageId: gmailResult?.messageId, auditRecorded: gmailResult?.auditRecorded }
    : { status: 'failed', attemptedAt: activatedAt, error: deliveryError || 'Email delivery failed.' } };
  const { data, error } = await supabase.from('job_offers').update({ last_saved_at: sentAt, offer_details: deliveryDetails }).eq('id', draft.id).select().single();
  if (error) throw new Error(`The secure link is live, but delivery status could not be recorded: ${error.message}`);
  return { offer: mapJobOfferRow(data), provider, deliveryError };
};

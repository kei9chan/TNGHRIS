import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  GmailError,
  decryptRefreshToken,
  hasExactGmailSendScope,
  normalizeEmail,
  recordDeliveryAudit,
  refreshAccessToken,
  sendGmailMessage,
} from '../_shared/gmail.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeStatuses = ['Sent', 'Viewed'];
const responseActions = ['accept', 'decline'];
const signedStatuses = ['Signed', 'Accepted and Signed'];
const peso = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value)) : 'Not specified';

const sendConnectedOfferEmail = async (client: SupabaseClient, offer: Record<string, any>, to: string, subject: string, message: string, senderName: string) => {
  if (!offer.sent_by_user_id) throw new GmailError('The original offer sender is unavailable. HR must resend from a connected Gmail account.', 409, true);
  const { data: hrisUser } = await client.from('hris_users').select('id,auth_user_id,email,full_name,status').eq('id', offer.sent_by_user_id).maybeSingle();
  if (!hrisUser?.auth_user_id || hrisUser.status !== 'Active') throw new GmailError('The original offer sender is not an active HRIS user.', 403);
  const { data: connection } = await client.from('gmail_connections').select('google_email,refresh_token_ciphertext,refresh_token_iv,granted_scopes,connection_status').eq('user_id', hrisUser.auth_user_id).maybeSingle();
  if (!connection || connection.connection_status !== 'connected' || !connection.refresh_token_ciphertext || !connection.refresh_token_iv || !hasExactGmailSendScope(connection.granted_scopes)) {
    throw new GmailError('The offer sender must reconnect Gmail before an automatic confirmation can be sent.', 409, true);
  }
  const senderEmail = normalizeEmail(connection.google_email);
  const attemptedAt = new Date().toISOString();
  try {
    const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, connection.refresh_token_iv);
    const token = await refreshAccessToken(refreshToken);
    const sent = await sendGmailMessage(token.accessToken, { senderEmail, senderName: senderName || hrisUser.full_name, to, subject, message });
    const sentAt = new Date().toISOString();
    await client.from('gmail_connections').update({ token_expiry: token.expiresAt, connection_status: 'connected', last_error: null, last_verified_at: sentAt, updated_at: sentAt }).eq('user_id', hrisUser.auth_user_id);
    const auditRecorded = await recordDeliveryAudit(client, { authUserId: hrisUser.auth_user_id, hrisUserId: hrisUser.id, userEmail: hrisUser.email, senderEmail, recipientEmail: to, subject, documentType: 'offer-welcome', documentId: offer.id, attemptedAt, sentAt, messageId: sent.messageId, threadId: sent.threadId, status: 'sent' });
    return { ...sent, senderEmail, auditRecorded };
  } catch (reason) {
    const failure = reason instanceof GmailError ? reason : new GmailError('Unable to send the signed acceptance confirmation.', 500);
    await client.from('gmail_connections').update({ connection_status: failure.reconnect ? 'error' : 'connected', last_error: failure.message, updated_at: new Date().toISOString() }).eq('user_id', hrisUser.auth_user_id);
    await recordDeliveryAudit(client, { authUserId: hrisUser.auth_user_id, hrisUserId: hrisUser.id, userEmail: hrisUser.email, senderEmail, recipientEmail: to, subject, documentType: 'offer-welcome', documentId: offer.id, attemptedAt, status: 'failed', error: failure.message });
    throw failure;
  }
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Offer service is not configured.' }, 503);
  let body: any; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const token = String(body?.token || ''); if (!tokenPattern.test(token)) return json({ error: 'This offer link is invalid. Check that the complete link was copied from the offer email.' }, 404);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: offer, error } = await client.from('job_offers').select('*').eq('secure_token', token).maybeSingle();
    if (error || !offer) return json({ error: 'This offer link is invalid or is no longer available. Contact Recruitment for a current link.' }, 404);
    const now = new Date(); const respondedAt = now.toISOString();
    if (activeStatuses.includes(offer.status) && offer.offer_expiration_date && new Date(`${offer.offer_expiration_date}T23:59:59`) < now) {
      await client.from('job_offers').update({ status: 'Expired', last_saved_at: respondedAt }).eq('id', offer.id).in('status', activeStatuses);
      offer.status = 'Expired';
    }
    const action = String(body.action || 'get');
    if (action === 'get' && offer.status === 'Draft') return json({ error: 'This offer has not been published yet. Contact Recruitment if you expected a live offer.' }, 409);
    if (action === 'get' && offer.status === 'Expired') {
      const expiry = offer.offer_expiration_date ? new Date(`${offer.offer_expiration_date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      return json({ error: `This offer link expired${expiry ? ` on ${expiry}` : ''}. Contact Recruitment if you need an updated offer.` }, 410);
    }
    if (action === 'signed-pdf') {
      if (!signedStatuses.includes(offer.status)) return json({ error: 'A signed PDF can only be stored after signing.' }, 409);
      const encoded = String(body.pdfBase64 || ''); if (!encoded || encoded.length > 7_000_000) return json({ error: 'Signed PDF is missing or too large.' }, 400);
      let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); } catch { return json({ error: 'Signed PDF is invalid.' }, 400); }
      if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return json({ error: 'Signed PDF is invalid.' }, 400);
      const path = `signed-offers/${offer.id}/${Date.now()}.pdf`; const upload = await client.storage.from('offer-assets').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (upload.error) throw upload.error; await client.from('job_offers').update({ signed_pdf_path: path, last_saved_at: respondedAt }).eq('id', offer.id);
      return json({ ok: true });
    }
    const { data: application } = await client.from('job_applications').select('candidate_id,requisition_id').eq('id', offer.application_id).maybeSingle();
    const [{ data: candidate }, { data: requisition }] = await Promise.all([
      application?.candidate_id ? client.from('job_candidates').select('first_name,last_name,email').eq('id', application.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
      application?.requisition_id ? client.from('job_requisitions').select('title').eq('id', application.requisition_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const details = offer.offer_details || {}; let logoUrl = ''; let signedPdfUrl = '';
    if (offer.logo_path) { const signed = await client.storage.from('offer-assets').createSignedUrl(offer.logo_path, 60 * 30); logoUrl = signed.data?.signedUrl || ''; }
    if (details?.appearance?.backgroundImagePath) { const signed = await client.storage.from('offer-assets').createSignedUrl(details.appearance.backgroundImagePath, 60 * 30); details.appearance.backgroundImageUrl = signed.data?.signedUrl || ''; }
    if (offer.signed_pdf_path) { const signed = await client.storage.from('offer-assets').createSignedUrl(offer.signed_pdf_path, 60 * 15); signedPdfUrl = signed.data?.signedUrl || ''; }
    if (action === 'get') {
      if (offer.status === 'Sent') { const viewedAt = offer.viewed_at || respondedAt; const update = await client.from('job_offers').update({ status: 'Viewed', viewed_at: viewedAt, last_saved_at: respondedAt }).eq('id', offer.id).eq('status', 'Sent').select('status,viewed_at').maybeSingle(); if (update.data) { offer.status = update.data.status; offer.viewed_at = update.data.viewed_at; } }
      return json({ offer: { id: offer.id, offerNumber: offer.offer_number, status: offer.status, basePay: Number(offer.base_pay), startDate: offer.start_date, employmentEndDate: offer.employment_end_date, expirationDate: offer.offer_expiration_date, employmentType: offer.employment_type, employmentTypeCustomName: offer.employment_type_custom_name, details, logoUrl, signedPdfUrl, candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate', jobTitle: details.jobTitle || requisition?.title || '', requireSignature: offer.require_signature !== false, viewedAt: offer.viewed_at, acceptedAt: offer.accepted_at, signedAt: offer.signed_at, declinedAt: offer.declined_at, signatureName: offer.signature_name } });
    }
    if (!activeStatuses.includes(offer.status)) return json({ error: `This offer is already ${offer.status}.` }, 409);
    if (!responseActions.includes(action)) return json({ error: 'Choose accept or decline.' }, 400);
    if (action === 'accept') {
      if (body.consent !== true) return json({ error: 'Electronic-signature consent is required.' }, 400);
      const signatureName = String(body.signatureName || '').trim(); const signatureType = String(body.signatureType || 'typed');
      if (signatureName.length < 2) return json({ error: 'Enter your full legal name.' }, 400);
      if (!['typed','drawn'].includes(signatureType)) return json({ error: 'Choose a valid signature type.' }, 400);
      let signaturePath: string | null = null;
      if (signatureType === 'drawn') { const dataUrl = String(body.signatureDataUrl || ''); const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/); if (!match || match[1].length > 1_500_000) return json({ error: 'Drawn signature is missing or too large.' }, 400); const bytes = Uint8Array.from(atob(match[1]), character => character.charCodeAt(0)); signaturePath = `signatures/${offer.id}/${Date.now()}.png`; const upload = await client.storage.from('offer-assets').upload(signaturePath, bytes, { contentType: 'image/png', upsert: false }); if (upload.error) throw upload.error; }
      const nextDetails = { ...details, candidateResponse: { action: 'accept', signatureName, signatureType, respondedAt, consent: true } };
      const { data: signed, error: signError } = await client.rpc('accept_and_sign_job_offer', { p_offer_id: offer.id, p_signature_name: signatureName, p_signature_type: signatureType, p_signature_path: signaturePath, p_responded_at: respondedAt, p_offer_details: nextDetails });
      if (signError || !signed) throw new Error(signError?.message || 'Unable to finalize the signed offer.');
      const signedOffer = Array.isArray(signed) ? signed[0] : signed;
      const firstName = candidate?.first_name || signatureName.split(/\s+/)[0] || 'Candidate';
      const fullName = candidate ? `${candidate.first_name} ${candidate.last_name}` : signatureName;
      const position = details.jobTitle || requisition?.title || 'the offered position';
      const businessUnit = details.businessUnit || 'The Nextperience';
      const senderName = details.welcomeEmail?.senderName || 'TNG Recruitment Team';
      const senderEmail = details.welcomeEmail?.senderEmail || details.emailDelivery?.senderEmail || '';
      const defaultSubject = `We received your signed acceptance — ${position} at ${businessUnit}`;
      const defaultMessage = `Hi ${firstName},\n\nWe have received your signed acceptance for the ${position} position at ${businessUnit}.\n\nThank you for accepting our offer. We will now proceed with the next steps, including contract signing and onboarding. Our team will contact you shortly with the details and requirements.\n\nStart date: ${offer.start_date ? new Date(`${offer.start_date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'To be confirmed'}\nLocation: ${details.workLocation || 'To be confirmed'}\nMonthly compensation: ${peso(details.grossMonthlySalary ?? offer.base_pay)}\n\nWe look forward to welcoming you to ${businessUnit}!\n\nBest regards,\n\n${senderName}\n${businessUnit}${senderEmail ? `\n${senderEmail}` : ''}`;
      const replaceValues = (value: string) => value.replace(/{{\s*candidate_first_name\s*}}/gi, firstName).replace(/{{\s*candidate_full_name\s*}}/gi, fullName).replace(/{{\s*position_title\s*}}/gi, position).replace(/{{\s*business_unit\s*}}/gi, businessUnit).replace(/{{\s*start_date\s*}}/gi, offer.start_date || 'To be confirmed').replace(/{{\s*location\s*}}/gi, details.workLocation || 'To be confirmed').replace(/{{\s*monthly_compensation\s*}}/gi, peso(details.grossMonthlySalary ?? offer.base_pay)).replace(/{{\s*sender_name\s*}}/gi, senderName).replace(/{{\s*sender_email\s*}}/gi, senderEmail);
      const emailSubject = replaceValues(String(details.welcomeEmail?.subject || defaultSubject));
      const emailMessage = replaceValues(String(details.welcomeEmail?.message || defaultMessage));
      const recipient = String(offer.recipient_email || candidate?.email || '').trim();
      let confirmationEmail: any = { subject: emailSubject, message: emailMessage, recipient, senderName, senderEmail, attemptedAt: respondedAt, status: 'sending' };
      try {
        const sent = await sendConnectedOfferEmail(client, offer, recipient, emailSubject, emailMessage, senderName);
        confirmationEmail = { ...confirmationEmail, senderEmail: sent.senderEmail, status: 'sent', sentAt: new Date().toISOString(), provider: 'google-gmail', messageId: sent.messageId, threadId: sent.threadId, auditRecorded: sent.auditRecorded };
      } catch (emailError) {
        confirmationEmail = { ...confirmationEmail, status: 'failed', error: emailError instanceof Error ? emailError.message : 'Unable to send the signed acceptance confirmation.' };
      }
      const finalDetails = { ...(signedOffer?.offer_details || nextDetails), welcomeEmail: confirmationEmail };
      const detailUpdate = await client.from('job_offers').update({ offer_details: finalDetails, last_saved_at: new Date().toISOString() }).eq('id', offer.id);
      if (detailUpdate.error) console.error('Unable to store confirmation email status', detailUpdate.error);
      await client.from('audit_logs').insert({ user_id: 'candidate', user_email: null, action: 'UPDATE', entity: 'Offer', entity_id: offer.id, details: `Candidate accepted and signed offer ${offer.offer_number}` });
      return json({ ok: true, status: 'Accepted and Signed', respondedAt, confirmationEmailStatus: confirmationEmail.status, confirmationEmailError: confirmationEmail.error || null });
    }
    if (action === 'decline') {
      const reason = String(body.reason || '').trim().slice(0, 2000); const nextDetails = { ...details, candidateResponse: { action: 'decline', declineReason: reason || null, respondedAt } };
      const declined = await client.from('job_offers').update({ status: 'Declined', declined_at: respondedAt, decline_reason: reason || null, offer_details: nextDetails, last_saved_at: respondedAt }).eq('id', offer.id).in('status', activeStatuses).select('id').maybeSingle();
      if (!declined.data) return json({ error: 'This offer has already been answered.' }, 409);
      const { data: recipients } = await client.from('hris_users').select('id').in('role', ['Admin','Super Admin','HR Manager','HR Staff']).eq('status','Active');
      if (recipients?.length) await client.from('notifications').insert(recipients.map(user => ({ user_id: user.id, type: 'RECRUITMENT', title: 'Offer declined', message: `${candidate ? `${candidate.first_name} ${candidate.last_name}` : 'A candidate'} declined offer ${offer.offer_number}${reason ? `: ${reason}` : '.'}`, link: '/recruitment/offers', related_entity_id: offer.id })));
      await client.from('audit_logs').insert({ user_id: 'candidate', user_email: null, action: 'UPDATE', entity: 'Offer', entity_id: offer.id, details: `Candidate declined offer ${offer.offer_number}` });
      return json({ ok: true, status: 'Declined', respondedAt });
    }
    return json({ error: 'Choose accept or decline.' }, 400);
  } catch (error) { console.error('Public offer request failed', error); return json({ error: error instanceof Error ? error.message : 'Unable to process this offer right now.' }, 500); }
});

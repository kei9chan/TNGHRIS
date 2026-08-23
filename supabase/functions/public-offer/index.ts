import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeStatuses = ['Sent', 'Viewed'];
const responseActions = ['accept', 'decline'];
const signedStatuses = ['Signed', 'Accepted and Signed'];
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const cleanHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const encodeBase64Url = (value: string) => encodeBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const encodeHeader = (value: string) => `=?UTF-8?B?${encodeBase64(value)}?=`;
const htmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const peso = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value)) : 'Not specified';

const googleError = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message || payload?.error_description || `Google Gmail returned HTTP ${response.status}.`;
  if (response.status === 403 && ['insufficientPermissions', 'forbidden'].includes(reason)) return 'The Google connection does not include Gmail send permission. Reconnect Google with Gmail send access, then retry.';
  if (reason === 'accessNotConfigured') return 'Gmail API is not enabled for the connected Google Cloud project.';
  return reason && !message.includes(reason) ? `${message} (${reason})` : message;
};

const sendGoogleEmail = async (to: string, subject: string, message: string) => {
  if (!validEmail(to)) throw new Error('The candidate email address is missing or invalid.');
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Google Gmail integration secrets are not configured.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  if (!tokenResponse.ok) throw new Error(await googleError(tokenResponse));
  const accessToken = (await tokenResponse.json())?.access_token;
  if (!accessToken) throw new Error('Google did not return an access token.');
  const senderEmail = Deno.env.get('GOOGLE_GMAIL_FROM_EMAIL')?.trim() || (validEmail(Deno.env.get('GOOGLE_CALENDAR_ID')?.trim() || '') ? Deno.env.get('GOOGLE_CALENDAR_ID')!.trim() : '');
  const boundary = `tng-offer-${crypto.randomUUID()}`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:680px">${htmlEscape(message).replace(/\n/g, '<br>')}</div>`;
  const mime = [senderEmail ? `From: TNG Recruitment Team <${cleanHeader(senderEmail)}>` : '', `To: ${cleanHeader(to)}`, `Subject: ${encodeHeader(cleanHeader(subject))}`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', '', message, `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', '', html, `--${boundary}--`, ''].filter((value, index) => value || index > 0).join('\r\n');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encodeBase64Url(mime) }) });
  if (!response.ok) throw new Error(await googleError(response));
  return await response.json();
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Offer service is not configured.' }, 503);
  let body: any; try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const token = String(body?.token || ''); if (!tokenPattern.test(token)) return json({ error: 'Offer not found.' }, 404);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: offer, error } = await client.from('job_offers').select('*').eq('secure_token', token).maybeSingle();
    if (error || !offer) return json({ error: 'Offer not found.' }, 404);
    const now = new Date(); const respondedAt = now.toISOString();
    if (activeStatuses.includes(offer.status) && offer.offer_expiration_date && new Date(`${offer.offer_expiration_date}T23:59:59`) < now) {
      await client.from('job_offers').update({ status: 'Expired', last_saved_at: respondedAt }).eq('id', offer.id).in('status', activeStatuses);
      offer.status = 'Expired';
    }
    const action = String(body.action || 'get');
    if (action === 'get' && offer.status === 'Draft') return json({ error: 'Offer is not available yet.' }, 404);
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
      return json({ offer: { id: offer.id, offerNumber: offer.offer_number, status: offer.status, basePay: Number(offer.base_pay), startDate: offer.start_date, expirationDate: offer.offer_expiration_date, employmentType: offer.employment_type, details, logoUrl, signedPdfUrl, candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate', jobTitle: details.jobTitle || requisition?.title || '', requireSignature: offer.require_signature !== false, viewedAt: offer.viewed_at, acceptedAt: offer.accepted_at, signedAt: offer.signed_at, declinedAt: offer.declined_at, signatureName: offer.signature_name } });
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
      const senderEmail = details.welcomeEmail?.senderEmail || Deno.env.get('GOOGLE_GMAIL_FROM_EMAIL')?.trim() || Deno.env.get('GOOGLE_CALENDAR_ID')?.trim() || '';
      const defaultSubject = `We received your signed acceptance — ${position} at ${businessUnit}`;
      const defaultMessage = `Hi ${firstName},\n\nWe have received your signed acceptance for the ${position} position at ${businessUnit}.\n\nThank you for accepting our offer. We will now proceed with the next steps, including contract signing and onboarding. Our team will contact you shortly with the details and requirements.\n\nStart date: ${offer.start_date ? new Date(`${offer.start_date}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'To be confirmed'}\nLocation: ${details.workLocation || 'To be confirmed'}\nMonthly compensation: ${peso(details.grossMonthlySalary ?? offer.base_pay)}\n\nWe look forward to welcoming you to ${businessUnit}!\n\nBest regards,\n\n${senderName}\n${businessUnit}${senderEmail ? `\n${senderEmail}` : ''}`;
      const replaceValues = (value: string) => value.replace(/{{\s*candidate_first_name\s*}}/gi, firstName).replace(/{{\s*candidate_full_name\s*}}/gi, fullName).replace(/{{\s*position_title\s*}}/gi, position).replace(/{{\s*business_unit\s*}}/gi, businessUnit).replace(/{{\s*start_date\s*}}/gi, offer.start_date || 'To be confirmed').replace(/{{\s*location\s*}}/gi, details.workLocation || 'To be confirmed').replace(/{{\s*monthly_compensation\s*}}/gi, peso(details.grossMonthlySalary ?? offer.base_pay)).replace(/{{\s*sender_name\s*}}/gi, senderName).replace(/{{\s*sender_email\s*}}/gi, senderEmail);
      const emailSubject = replaceValues(String(details.welcomeEmail?.subject || defaultSubject));
      const emailMessage = replaceValues(String(details.welcomeEmail?.message || defaultMessage));
      const recipient = String(offer.recipient_email || candidate?.email || '').trim();
      let confirmationEmail: any = { subject: emailSubject, message: emailMessage, recipient, senderName, senderEmail, attemptedAt: respondedAt, status: 'sending' };
      try {
        const sent = await sendGoogleEmail(recipient, emailSubject, emailMessage);
        confirmationEmail = { ...confirmationEmail, status: 'sent', sentAt: new Date().toISOString(), provider: 'google-gmail', messageId: sent.id };
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

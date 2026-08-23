import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeStatuses = ['Sent', 'Viewed'];
const responseActions = ['accept', 'decline'];

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
      if (offer.status !== 'Signed') return json({ error: 'A signed PDF can only be stored after signing.' }, 409);
      const encoded = String(body.pdfBase64 || ''); if (!encoded || encoded.length > 7_000_000) return json({ error: 'Signed PDF is missing or too large.' }, 400);
      let bytes: Uint8Array; try { bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)); } catch { return json({ error: 'Signed PDF is invalid.' }, 400); }
      if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) return json({ error: 'Signed PDF is invalid.' }, 400);
      const path = `signed-offers/${offer.id}/${Date.now()}.pdf`; const upload = await client.storage.from('offer-assets').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (upload.error) throw upload.error; await client.from('job_offers').update({ signed_pdf_path: path, last_saved_at: respondedAt }).eq('id', offer.id);
      return json({ ok: true });
    }
    const { data: application } = await client.from('job_applications').select('candidate_id,requisition_id').eq('id', offer.application_id).maybeSingle();
    const [{ data: candidate }, { data: requisition }] = await Promise.all([
      application?.candidate_id ? client.from('job_candidates').select('first_name,last_name').eq('id', application.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
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
      const accepted = await client.from('job_offers').update({ status: 'Accepted', accepted_at: respondedAt, last_saved_at: respondedAt }).eq('id', offer.id).in('status', activeStatuses).select('id').maybeSingle();
      if (!accepted.data) return json({ error: 'This offer has already been answered.' }, 409);
      const nextDetails = { ...details, candidateResponse: { action: 'accept', signatureName, signatureType, respondedAt, consent: true } };
      const signed = await client.from('job_offers').update({ status: 'Signed', signed_at: respondedAt, signature_name: signatureName, signature_type: signatureType, signature_path: signaturePath, offer_details: nextDetails, last_saved_at: respondedAt }).eq('id', offer.id).eq('status', 'Accepted').select('id').maybeSingle();
      if (!signed.data) throw new Error('Unable to finalize the signed offer.');
      await client.from('audit_logs').insert({ user_id: 'candidate', user_email: null, action: 'UPDATE', entity: 'Offer', entity_id: offer.id, details: `Candidate accepted and signed offer ${offer.offer_number}` });
      return json({ ok: true, status: 'Signed', respondedAt });
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

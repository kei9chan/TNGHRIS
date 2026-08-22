import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const { data: application } = await client.from('job_applications').select('candidate_id,requisition_id').eq('id', offer.application_id).maybeSingle();
    const [{ data: candidate }, { data: requisition }] = await Promise.all([
      application?.candidate_id ? client.from('job_candidates').select('first_name,last_name').eq('id', application.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
      application?.requisition_id ? client.from('job_requisitions').select('title').eq('id', application.requisition_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const details = offer.offer_details || {}; let logoUrl = '';
    if (offer.logo_path) { const signed = await client.storage.from('offer-assets').createSignedUrl(offer.logo_path, 60 * 30); logoUrl = signed.data?.signedUrl || ''; }
    if (!body.action || body.action === 'get') return json({ offer: { offerNumber: offer.offer_number, status: offer.status, basePay: Number(offer.base_pay), startDate: offer.start_date, expirationDate: offer.offer_expiration_date, employmentType: offer.employment_type, details, logoUrl, candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : 'Candidate', jobTitle: details.jobTitle || requisition?.title || '' } });
    if (offer.status !== 'Sent') return json({ error: `This offer is already ${offer.status}.` }, 409);
    if (offer.offer_expiration_date && new Date(`${offer.offer_expiration_date}T23:59:59`) < new Date()) return json({ error: 'This offer has expired. Please contact recruitment.' }, 410);
    const action = String(body.action); if (!['accept', 'decline'].includes(action)) return json({ error: 'Choose accept or decline.' }, 400);
    const signature = String(body.signature || '').trim(); if (action === 'accept' && signature.length < 2) return json({ error: 'Enter your full name as your signature.' }, 400);
    const respondedAt = new Date().toISOString(); const nextStatus = action === 'accept' ? 'Signed' : 'Declined';
    const nextDetails = { ...details, candidateResponse: { action, signature: action === 'accept' ? signature : null, respondedAt } };
    const { error: updateError } = await client.from('job_offers').update({ status: nextStatus, offer_details: nextDetails, last_saved_at: respondedAt }).eq('id', offer.id).eq('status', 'Sent');
    if (updateError) throw updateError;
    await client.from('audit_logs').insert({ user_id: 'candidate', user_email: null, action: 'UPDATE', entity: 'Offer', entity_id: offer.id, details: `Candidate ${action === 'accept' ? 'accepted and signed' : 'declined'} offer ${offer.offer_number}` });
    return json({ ok: true, status: nextStatus, respondedAt });
  } catch (error) { console.error('Public offer request failed', error); return json({ error: 'Unable to process this offer right now.' }, 500); }
});

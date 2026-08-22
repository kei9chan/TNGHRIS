import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Offer, OfferBuilderDetails } from '../types';
import { OfferSheet } from '../components/recruitment/OfferCreationDrawer';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { supabase } from '../services/supabaseClient';

const OfferResponse: React.FC = () => {
  const { token } = useParams();
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [signature, setSignature] = useState(''); const [submitting, setSubmitting] = useState(false); const [result, setResult] = useState('');
  useEffect(() => { let active = true; supabase.functions.invoke('public-offer', { body: { token, action: 'get' } }).then(({ data: body, error: invokeError }) => { if (invokeError || !body?.offer) throw new Error(body?.error || invokeError?.message || 'Offer not found.'); if (active) setData(body.offer); }).catch(reason => active && setError(reason.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [token]);
  const respond = async (action: 'accept' | 'decline') => { if (action === 'accept' && signature.trim().length < 2) { setError('Enter your full name as your signature.'); return; } setSubmitting(true); setError(''); try { const { data: body, error: invokeError } = await supabase.functions.invoke('public-offer', { body: { token, action, signature } }); if (invokeError || !body?.ok) throw new Error(body?.error || invokeError?.message || 'Unable to submit your response.'); setResult(action === 'accept' ? 'Thank you. Your signed acceptance has been recorded.' : 'Your response has been recorded. Recruitment will be notified.'); setData((current: any) => ({ ...current, status: body.status })); } catch (reason: any) { setError(reason.message); } finally { setSubmitting(false); } };
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><p className="text-slate-500">Loading your offer…</p></div>;
  if (error && !data) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center shadow"><h1 className="text-2xl font-bold">Offer unavailable</h1><p className="mt-3 text-slate-600">{error}</p></div></div>;
  const offer: Partial<Offer> = { basePay: data.basePay, startDate: new Date(data.startDate), offerExpirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined, employmentType: data.employmentType, status: data.status };
  const details = data.details as OfferBuilderDetails;
  return <div className="min-h-screen bg-slate-100 px-4 py-8"><OfferSheet offer={offer} details={details} candidateName={data.candidateName} companyName={details.businessUnit || 'The Nextperience'} logoUrl={data.logoUrl}/><div id="candidate-response" className="mx-auto mt-6 max-w-5xl rounded-2xl bg-white p-6 shadow"><h2 className="text-xl font-bold">Your response</h2>{result ? <p className="mt-3 rounded-xl bg-emerald-50 p-4 font-medium text-emerald-800">{result}</p> : data.status !== 'Sent' ? <p className="mt-3 rounded-xl bg-slate-100 p-4">This offer is already marked <b>{data.status}</b>.</p> : <><p className="mt-2 text-sm text-slate-600">To accept, type your full legal name as your electronic signature.</p><div className="mt-4 max-w-md"><Input label="Candidate signature" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Full legal name"/></div>{error && <p className="mt-3 text-sm text-rose-600">{error}</p>}<div className="mt-5 flex flex-wrap gap-3"><Button isLoading={submitting} onClick={() => void respond('accept')}>Accept & Sign Offer</Button><Button variant="danger" disabled={submitting} onClick={() => { if (window.confirm('Decline this offer?')) void respond('decline'); }}>Decline Offer</Button><a className="rounded-md bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700" href="mailto:recruitment@thenextperience.com">Ask a Question</a></div></>}</div></div>;
};

export default OfferResponse;

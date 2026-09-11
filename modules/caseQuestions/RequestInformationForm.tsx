import React, {useRef, useState} from 'react';
import {supabase} from '../../services/supabaseClient';

const field = 'block w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-600 dark:bg-slate-900';
export default function RequestInformationForm({data, nteId, onSent, onCancel}: {
    data: any; nteId?: string; onSent: () => Promise<void>; onCancel: () => void;
}) {
    const [recipient, setRecipient] = useState('respondent');
    const [question, setQuestion] = useState('');
    const [due, setDue] = useState('');
    const [attachment, setAttachment] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    const nonce = useRef(crypto.randomUUID());
    const edit = () => { nonce.current = crypto.randomUUID(); setError(''); };
    const respondents = (data.respondents || []).filter((r: any) => !nteId || r.nteId === nteId);
    const respondentNames = [...new Set(respondents.map((r: any) => r.name))].join(', ');
    const unavailable = (recipient !== 'reporter' && !respondents.length) || (recipient !== 'respondent' && !data.recipient?.id);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (lock.current) return;
        const deadline = new Date(due + ':00+08:00');
        if (!question.trim()) { setError('Please enter the question or information required.'); return; }
        if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
            setError('Please choose a future response deadline in Philippine time.'); return;
        }
        if (unavailable) { setError('The selected recipient is not available for this case.'); return; }
        lock.current = true; setBusy(true); setError('');
        try {
            const {error: rpcError} = await supabase.rpc('request_case_information', {
                p_id: data.id, p_nte_id: nteId || null, p_recipient: recipient,
                p_body: question.trim(), p_deadline: deadline.toISOString(),
                p_attachment: attachment, p_internal_note: note, p_nonce: nonce.current,
            });
            if (rpcError) throw rpcError;
            await onSent();
        } catch (failure: any) {
            setError(failure.message || 'The request could not be sent. Please try again.');
        } finally { lock.current = false; setBusy(false); }
    };

    return <form onSubmit={submit} className="rounded-xl border border-violet-300 p-4 dark:border-violet-700">
        <h3 className="mb-3 font-bold">Request additional information</h3>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
            <label className="block">Request Recipient
                <select className={field} value={recipient} onChange={e => {setRecipient(e.target.value); edit();}}>
                    <option value="respondent">NTE Recipient / Respondent</option>
                    <option value="reporter">Original Incident Reporter</option>
                    <option value="both">Both</option>
                </select>
            </label>
            <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-900">
                {recipient !== 'reporter' && <p>Respondent: {respondentNames || 'No issued NTE respondent available'}</p>}
                {recipient !== 'respondent' && <p>Original Incident Reporter: {data.recipient?.name || 'Not recorded'}</p>}
                {recipient === 'both' && <p className="mt-1">Each person receives a separate request and can only respond to their own questions.</p>}
            </div>
            <label className="block">Question or Information Required
                <textarea required maxLength={10000} rows={4} className={field} value={question} onChange={e => {setQuestion(e.target.value); edit();}}/>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">Response Deadline (Philippine time)
                    <input required type="datetime-local" className={field} value={due} onChange={e => {setDue(e.target.value); edit();}}/>
                </label>
                <label className="block">Supporting Attachment Required
                    <select className={field} value={attachment ? 'yes' : 'no'} onChange={e => {setAttachment(e.target.value === 'yes'); edit();}}>
                        <option value="no">No</option><option value="yes">Yes</option>
                    </select>
                </label>
            </div>
            <label className="block">Internal Note <span className="text-sm">— HR/Admin only</span>
                <textarea maxLength={10000} rows={2} className={field} value={note} onChange={e => {setNote(e.target.value); edit();}}/>
            </label>
            <p className="text-sm">Responses become date-stamped supplemental case records. The original Incident Report is never replaced.</p>
            {unavailable && <p className="text-amber-700 dark:text-amber-300">Select an available recipient before sending.</p>}
            <div className="flex flex-wrap gap-3">
                <button disabled={busy || unavailable} className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Sending request…' : 'Send request'}</button>
                <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2">Cancel</button>
            </div>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
    </form>;
}

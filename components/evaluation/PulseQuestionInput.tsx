import React from 'react';
import { PulseSurveyQuestion } from '../../types';
import { PulseAnswer, requiredQuestion, validateAnswer } from '../../services/pulseQuestionRules';

export default function PulseQuestionInput({ question: q, value, onChange, prefix = 'answer' }: { question: PulseSurveyQuestion; value?: PulseAnswer; onChange: (value: PulseAnswer) => void; prefix?: string }) {
  const name = `${prefix}-${q.id}`;
  const control = 'rounded-md border border-gray-300 p-3 dark:bg-slate-700 dark:border-slate-500';
  const error = validateAnswer(q, value);
  const time = typeof value === 'string' ? value : '';
  return <fieldset className="space-y-3">
    <legend className="font-semibold">{q.text} <span className="text-sm font-normal">({requiredQuestion(q) ? 'Required' : 'Optional'})</span></legend>
    {(q.type === 'rating' || q.type === 'yes_no') && <div className="flex flex-wrap gap-4">{(q.type === 'rating' ? [1,2,3,4,5] : ['Yes','No']).map(option => <label key={option} className={`${control} flex items-center gap-2`}><input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />{option}</label>)}</div>}
    {q.type === 'text' && <textarea aria-label={q.text} className={`${control} w-full`} rows={3} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />}
    {q.type === 'checkboxes' && <><p className="text-sm">Select {q.minSelections ?? (requiredQuestion(q) ? 1 : 0)} to {q.maxSelections ?? q.choices?.length ?? 0} choices{!requiredQuestion(q) ? ', or leave blank' : ''}.</p>{(q.choices || []).map(c => <label key={c.id} className="flex items-center gap-3 py-2"><input type="checkbox" checked={Array.isArray(value) && value.includes(c.id)} onChange={e => { const selected = Array.isArray(value) ? value : []; onChange(e.target.checked ? [...selected, c.id] : selected.filter(id => id !== c.id)); }} />{c.label}</label>)}</>}
    {q.type === 'date' && <input aria-label={q.text} className={control} type="date" min={q.minDate} max={q.maxDate} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value)} />}
    {q.type === 'time' && <div className="flex flex-wrap gap-2">
      <select aria-label={`${q.text}: hour`} className={control} value={time ? (q.timeFormat === '12' ? String(Number(time.slice(0,2)) % 12 || 12) : time.slice(0,2)) : ''} onChange={e => { if (!e.target.value) return onChange(''); const h = q.timeFormat === '12' ? Number(e.target.value) % 12 + (Number(time.slice(0,2)) >= 12 ? 12 : 0) : Number(e.target.value); onChange(`${String(h).padStart(2,'0')}:${time.slice(3) || '00'}`); }}><option value="">Hour</option>{Array.from({length:q.timeFormat === '12' ? 12 : 24},(_,i) => q.timeFormat === '12' ? String(i+1) : String(i).padStart(2,'0')).map(h => <option key={h}>{h}</option>)}</select>
      <select aria-label={`${q.text}: minute`} className={control} disabled={!time} value={time.slice(3) || '00'} onChange={e => onChange(`${time.slice(0,2)}:${e.target.value}`)}>{Array.from({length:60},(_,i) => String(i).padStart(2,'0')).map(m => <option key={m}>{m}</option>)}</select>
      {q.timeFormat === '12' && <select aria-label={`${q.text}: AM or PM`} className={control} disabled={!time} value={Number(time.slice(0,2)) >= 12 ? 'PM' : 'AM'} onChange={e => onChange(`${String(Number(time.slice(0,2)) % 12 + (e.target.value === 'PM' ? 12 : 0)).padStart(2,'0')}:${time.slice(3)}`)}><option>AM</option><option>PM</option></select>}
    </div>}
    {value !== undefined && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {value !== undefined && <button type="button" className="text-sm underline" onClick={() => onChange('')}>Clear answer</button>}
  </fieldset>;
}

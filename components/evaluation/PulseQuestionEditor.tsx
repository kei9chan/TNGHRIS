import React, { useState } from 'react';
import { PulseSurveyQuestion } from '../../types';
import { PulseAnswer, requiredQuestion, validateQuestion } from '../../services/pulseQuestionRules';
import PulseQuestionInput from './PulseQuestionInput';

export default function PulseQuestionEditor({ question: q, onChange, onDelete }: { question: PulseSurveyQuestion; onChange: (q: PulseSurveyQuestion) => void; onDelete: () => void }) {
  const [preview, setPreview] = useState(false);
  const [answer, setAnswer] = useState<PulseAnswer>();
  const control = 'rounded border p-2 dark:bg-slate-700';
  const patch = (value: Partial<PulseSurveyQuestion>) => { onChange({...q,...value}); setAnswer(undefined); };
  const choices = q.choices || [];
  const move = (index: number, offset: number) => { const next = [...choices]; [next[index], next[index+offset]] = [next[index+offset], next[index]]; patch({choices:next}); };
  return <div className="space-y-3 rounded border p-4">
    <label className="block">Question<input className={`${control} block w-full`} value={q.text} onChange={e => patch({text:e.target.value})} /></label>
    <div className="flex flex-wrap items-center gap-4"><label>Response type <select className={control} value={q.type} onChange={e => patch({type:e.target.value as PulseSurveyQuestion['type'],required:requiredQuestion(q)})}><option value="rating">Rating (1–5)</option><option value="text">Free Text</option><option value="yes_no">Yes or No</option><option value="checkboxes">Checkboxes / Multiple Selection</option><option value="date">Date Selection</option><option value="time">Time Selection</option></select></label><label><input type="checkbox" checked={requiredQuestion(q)} onChange={e => patch({required:e.target.checked})} /> Required</label></div>
    {q.type === 'checkboxes' && <div className="space-y-2">{choices.map((c,i) => <div className="flex flex-wrap gap-2" key={c.id}><input aria-label={`Choice ${i+1}`} className={`${control} flex-1`} value={c.label} onChange={e => patch({choices:choices.map(x => x.id === c.id ? {...x,label:e.target.value} : x)})} /><button type="button" aria-label={`Move choice ${i+1} up`} disabled={i === 0} onClick={() => move(i,-1)}>↑</button><button type="button" aria-label={`Move choice ${i+1} down`} disabled={i === choices.length-1} onClick={() => move(i,1)}>↓</button><button type="button" onClick={() => patch({choices:choices.filter(x => x.id !== c.id)})}>Delete choice</button></div>)}<button type="button" className="underline" onClick={() => patch({choices:[...choices,{id:crypto.randomUUID(),label:''}]})}>Add choice</button><div className="flex flex-wrap gap-3">{(['minSelections','maxSelections'] as const).map(field => <label key={field}>{field === 'minSelections' ? 'Minimum selections (optional)' : 'Maximum selections (optional)'}<input type="number" min={field === 'minSelections' ? 0 : 1} max={choices.length} step={1} className={`${control} block`} value={q[field] ?? ''} onChange={e => patch({[field]:e.target.value === '' ? undefined : Number(e.target.value)})} /></label>)}</div></div>}
    {q.type === 'date' && <div className="flex flex-wrap gap-3">{(['minDate','maxDate'] as const).map(field => <label key={field}>{field === 'minDate' ? 'Earliest date (optional)' : 'Latest date (optional)'}<input type="date" className={`${control} block`} value={q[field] || ''} onChange={e => patch({[field]:e.target.value || undefined})} /></label>)}</div>}
    {q.type === 'time' && <label>Time format <select className={control} value={q.timeFormat || '24'} onChange={e => patch({timeFormat:e.target.value as '12'|'24'})}><option value="12">12-hour (AM/PM)</option><option value="24">24-hour</option></select></label>}
    {validateQuestion(q) && <p className="text-sm text-amber-700">{validateQuestion(q)}</p>}
    <div className="flex gap-4"><button type="button" className="underline" onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview question'}</button><button type="button" className="text-red-600" onClick={onDelete}>Delete question</button></div>
    {preview && <div className="rounded bg-indigo-50 p-4 dark:bg-slate-900"><p className="mb-3 text-sm">Employee preview — answers here are not saved.</p><PulseQuestionInput prefix="preview" question={q} value={answer} onChange={setAnswer} /></div>}
  </div>;
}

import React from 'react';
import type {TimePreview} from './attendanceReadiness';
const date=(value:string)=>new Date(value+'T12:00:00+08:00').toLocaleDateString('en-PH',{weekday:'long',month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'});
const labels:Record<string,string>={regular:'Regular holiday',special_nonworking:'Special nonworking day',special_working:'Special working day',double_regular:'Double regular holiday'};
export default function GovernmentHolidayCard({preview,from,to}:{preview:TimePreview;from:string;to:string}){
 const calendar=preview.governmentCalendar;
 const holidays=preview.holidays.filter(h=>h.date>=from&&h.date<=to);
 return <section aria-label="Government holiday calendar" className={`rounded-xl border p-4 ${calendar?.covered?'border-emerald-200 bg-emerald-50 text-emerald-950':'border-amber-200 bg-amber-50 text-amber-950'}`}>
  <h3 className="font-bold">{calendar?.covered?'Philippine national holidays · Matched automatically':'Government holiday calendar · Update needed'}</h3>
  <p className="mt-1 text-sm">{calendar?.covered?'No holiday entry or coverage confirmation needed for this cutoff.':'The central calendar does not cover all selected dates yet. A government-source calendar update is needed; reimporting attendance or confirming a checkbox will not resolve this.'}</p>
  {!!holidays.length&&<ul className="mt-3 space-y-2">{holidays.map(h=><li key={h.id} className="text-sm"><strong>{date(h.date)} · {h.name}</strong><span className="mx-2">— {labels[h.kind]||h.kind}</span>{/^https:\/\//.test(h.source)&&<a className="underline" href={h.source} target="_blank" rel="noreferrer">Source</a>}</li>)}</ul>}
  {calendar?.covered&&!holidays.length&&<p className="mt-2 text-sm">No listed holidays fall within this cutoff.</p>}
  <details className="mt-3 text-sm"><summary className="cursor-pointer">Calendar sources and local holidays</summary>
   <p className="mt-2">National dates and classifications come from published government announcements. Existing business-unit local holiday declarations are retained. A local holiday applies only to its covered location; it is not a nationwide holiday.</p>
   {calendar?.coverage.map(c=><div key={c.version} className="mt-2"><p>{c.date_from}–{c.date_to} · Sources checked {c.checked_on}</p>{c.source_urls.map((url,i)=><a key={url} className="mr-3 inline-block underline" href={url} target="_blank" rel="noreferrer">Government source {i+1}</a>)}</div>)}
  </details>
 </section>;
}

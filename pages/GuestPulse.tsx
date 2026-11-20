import React,{useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import QRCode from 'qrcode';
import {supabase} from '../services/supabaseClient';
import './guestPulse.css';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
async function rpc(name:string,args:object){
 const {data,error}=await supabase.rpc('guest_pulse_'+name,args);
 if(error) throw new Error(error.message);
 return data;
}
const blankQuestion=()=>({label:'',type:'rating',options:[] as string[]});
export function GuestCard(){
 const {code}=useParams();const [card,setCard]=useState<any>(),[answers,setAnswers]=useState<any[]>([]),[date,setDate]=useState(today),[manager,setManager]=useState(false),[contact,setContact]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[key]=useState(()=>crypto.randomUUID());
 useEffect(()=>{rpc('card',{code}).then(c=>{if(!c)throw Error('This feedback form is closed.');setCard(c);setAnswers(c.questions.map(()=>({tags:[],note:'',value:''})));}).catch(e=>setError(e.message));},[code]);
 function update(i:number,change:object){setAnswers(current=>current.map((a,k)=>k===i?{...a,...change}:a));}
 async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await rpc('submit',{code,request_id:key,visit_day:date,questions:card.questions,answers,manager,contact});setDone(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const labels=['Poor','Fair','Okay','Good','Excellent'];
 const isBalay=card?.title==='Balay Balay Restaurant';
 return <main className="gp guest seaside"><article>
   <header><small>{card?.unit}</small><h1>{card?.title||'Guest Pulse'}</h1>
     {isBalay&&<p>Good food. Beach days. Your say.</p>}
   </header>
   {done?<section className="guest-paper" role="status"><h2>Salamat for sharing!</h2><p>Your feedback has been recorded.{manager&&' For help during your visit, please tell a team member.'}</p></section>
   :card?<form className="guest-paper" onSubmit={send}>
     <div><small className="guest-time">About 60 seconds</small><h2>How was your {isBalay?'meal':'visit'}?</h2><p>A quick rating helps. A little detail tells us what to keep or change.</p></div>
     <div className="visit-info"><label>Visit date<input required type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><div>Your table<strong>{card.table}</strong><small>From your QR code</small></div></div>
     {card.questions.map((q:any,i:number)=>{
       const rating=q.type==='rating', tags=q.type==='tags', required=rating||q.type==='choice';
       const choices=rating?['1','2','3','4','5']:tags||q.type==='choice'?q.options||[]:[];
       const prompt=/love/i.test(q.label)?(isBalay?'A favorite dish or someone who made your day?':'Who or what made your day?'):/better|improv/i.test(q.label)?'What would make your next visit better?':'What would you like us to know?';
       return <fieldset key={i}><legend>{q.label} {required&&<span aria-label="required">*</span>}</legend>
         {tags&&<small>Choose any that fit, or tell us in your own words.</small>}
         <div className={rating?'guest-ratings':'chips'}>{choices.map((v:string,k:number)=>{
           const selected=tags?answers[i].tags.includes(v):answers[i].value===v;
           return <button key={v} type="button" aria-pressed={selected} onClick={()=>update(i,tags?{tags:selected?answers[i].tags.filter((t:string)=>t!==v):[...answers[i].tags,v]}:{value:v})}>
             {rating?<><svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="16" cy="16" r="13"/><circle cx="11" cy="13" r="1" fill="currentColor"/><circle cx="21" cy="13" r="1" fill="currentColor"/><path d={['M10 23 Q16 15 22 23','M11 21 Q16 18 21 21','M11 20 H21','M10 19 Q16 27 22 19','M9 18 H23 Q20 29 13 24 Q10 22 9 18Z'][k]}/></svg><b>{v}</b><small>{labels[k]}</small></>:v}
           </button>;
         })}</div>
         {(tags||q.type==='text')&&<label className="guest-comment">Add a comment <small>(optional)</small><textarea aria-label={q.label+' comment'} placeholder={prompt} maxLength={2000} value={answers[i].note} onChange={e=>update(i,{note:e.target.value})}/></label>}
       </fieldset>;
     })}
     <label className="guest-manager"><input type="checkbox" checked={manager} onChange={e=>setManager(e.target.checked)}/> I’d like to speak with a manager today.<small>For immediate help, please tell a team member.</small></label>
     <details><summary>Leave your name or contact details (optional)</summary><input aria-label="Name or contact" placeholder="Name, phone or email" maxLength={300} value={contact} onChange={e=>setContact(e.target.value)}/></details>
     {error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Sending…':'Share my feedback ♡'}</button>
     <small className="guest-footer">Shared with our management team. Contact details are optional.</small>
   </form>:<p role="status">{error||'Loading feedback form…'}</p>}
 </article></main>;

}
function TableCard({table,onEdit}:{table:any,onEdit?:()=>void}){
 const url=location.origin+'/guest-pulse/'+table.token;const [src,setSrc]=useState('');
 useEffect(()=>{QRCode.toDataURL(url,{width:512,margin:4}).then(setSrc);},[url]);
 return <section className="qr"><strong>{table.label}</strong>{src&&<img src={src} alt={'QR for '+table.label}/>}<a href={src} download={table.label+'.png'}>Download QR</a> · <a href={url} target="_blank" rel="noreferrer">Open form</a>{onEdit&&<button onClick={onEdit}>Rename</button>}</section>;
}
export default function GuestPulse({unit}:{unit:string}){
 const [data,setData]=useState<any>(),[period,setPeriod]=useState('This week'),[revision,refresh]=useState(0),[selected,select]=useState(''),[tab,setTab]=useState('Overview'),[error,setError]=useState(''),[draft,edit]=useState<any>(),[table,setTable]=useState<any>(),[busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;setData(null);rpc('workspace',{period}).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[period,revision]);
 useEffect(()=>{select('');edit(null);setTable(null);},[unit]);
 const units=data?.units.filter((u:any)=>!unit||unit===u.id)||[],forms=data?.forms.filter((f:any)=>units.some((u:any)=>u.id===f.unit))||[],form=forms.find((f:any)=>f.id===selected)||forms[0],canEdit=units.find((u:any)=>u.id===form?.unit)?.edit;
 const reviews=(data?.reviews||[]).filter((r:any)=>r.form===form?.id);
 const ratings=new Map<string,number[]>(),themes=new Map<string,number>();
 for(const r of reviews)for(const a of r.answers){if(a.type==='rating')ratings.set(a.label,[...(ratings.get(a.label)||[]),Number(a.value)]);for(const tag of a.tags||[])themes.set(a.label+' · '+tag,(themes.get(a.label+' · '+tag)||0)+1);}
 async function save(kind:string,item:any){setBusy(true);setError('');try{await rpc('save',{u:item.unit||form.unit,kind,item});if(kind==='form')select(item.id);edit(null);setTable(null);refresh(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function changeQuestion(i:number,change:object){edit({...draft,questions:draft.questions.map((q:any,k:number)=>k===i?{...q,...change}:q)});}
 return <div className="gp"><header><small>Guest experience</small><h1>Guest Pulse</h1><p>{form?.title||'Guest feedback'} {form&&'· '+units.find((u:any)=>u.id===form.unit)?.name}</p></header>{error&&<p role="alert">{error}</p>}{!data?<p>Loading workspace…</p>:<><div className="chips"><select aria-label="Feedback form" value={form?.id||''} onChange={e=>{select(e.target.value);edit(null);setTable(null);}}>{forms.map((f:any)=><option key={f.id} value={f.id}>{units.find((u:any)=>u.id===f.unit)?.name} · {f.title}{!f.active&&' (paused)'}</option>)}</select>{units.some((u:any)=>u.edit)&&<button onClick={()=>edit({id:crypto.randomUUID(),unit:units.find((u:any)=>u.edit).id,title:'',active:true,questions:[blankQuestion()]})}>+ New form</button>}</div>
 {draft?<form onSubmit={e=>{e.preventDefault();void save('form',draft);}}><h2>Feedback set</h2><label>Business unit <select disabled={forms.some((f:any)=>f.id===draft.id)} value={draft.unit} onChange={e=>edit({...draft,unit:e.target.value})}>{units.filter((u:any)=>u.edit).map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Form name <input required value={draft.title} onChange={e=>edit({...draft,title:e.target.value})}/></label><label><input type="checkbox" checked={draft.active} onChange={e=>edit({...draft,active:e.target.checked})}/> Accept responses</label>{draft.questions.map((q:any,i:number)=><fieldset key={i}><legend>Question {i+1}</legend><input required aria-label="Question wording" value={q.label} onChange={e=>changeQuestion(i,{label:e.target.value})}/><select value={q.type} onChange={e=>changeQuestion(i,{type:e.target.value})}>{['rating','choice','tags','text'].map(t=><option key={t}>{t}</option>)}</select>{['choice','tags'].includes(q.type)&&<label>Choices (one per line)<textarea required value={(q.options||[]).join('\n')} onChange={e=>changeQuestion(i,{options:e.target.value.split('\n')})}/></label>}<button type="button" onClick={()=>edit({...draft,questions:draft.questions.filter((_:any,k:number)=>i!==k)})}>Remove question</button></fieldset>)}<div className="chips"><button type="button" onClick={()=>edit({...draft,questions:[...draft.questions,blankQuestion()]})}>+ Question</button><button className="primary" disabled={busy}>Save feedback set</button><button type="button" onClick={()=>edit(null)}>Cancel</button></div></form>:form?<><nav className="chips">{['Overview','Comments','Table QR codes','Questions'].map(t=><button key={t} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</nav>{['Overview','Comments'].includes(tab)&&<select aria-label="Reporting period" value={period} onChange={e=>setPeriod(e.target.value)}>{['Today','This week','This month'].map(p=><option key={p}>{p}</option>)}</select>}
 {tab==='Overview'&&<><div className="metrics">{[[reviews.length,'Guest responses'],[reviews.filter((r:any)=>r.manager).length,'Manager requests'],[form.tables.length,'Table QR codes']].map(([n,l])=><section key={l}><b>{n}</b>{l}</section>)}</div>{reviews.length?<><h2>Average guest ratings</h2>{[...ratings].map(([l,ns])=><p key={l}>{l} <strong>{(ns.reduce((a,b)=>a+b,0)/ns.length).toFixed(1)} / 5</strong></p>)}<h2>Most selected feedback</h2>{[...themes].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([l,n])=><p key={l}>{l} <strong>{n}</strong></p>)}</>:<p>No guest responses for this period.</p>}</>}
 {tab==='Comments'&&(reviews.length?reviews.map((r:any)=><fieldset key={r.id}><legend>{r.table_label} · {r.visit}</legend>{r.manager&&<b>Manager requested</b>}{r.answers.map((a:any,i:number)=><p key={i}><strong>{a.label}</strong> · {[a.value,...(a.tags||[]),a.note].filter(Boolean).join(' · ')||'Skipped'}</p>)}{r.contact&&<p>Follow-up contact · {r.contact}</p>}</fieldset>):<p>No reviews in this period.</p>)}
 {tab==='Questions'&&<><ol>{form.questions.map((q:any,i:number)=><li key={i}>{i+1}. {q.label}</li>)}</ol>{canEdit&&<button onClick={()=>edit(structuredClone(form))}>Edit questions & settings</button>}</>}
 {tab==='Table QR codes'&&<>{canEdit&&<button onClick={()=>setTable({form:form.id,label:''})}>+ Add table</button>}{table&&<form onSubmit={e=>{e.preventDefault();void save('table',table);}}><label>Table name <input required value={table.label} onChange={e=>setTable({...table,label:e.target.value})}/></label><button disabled={busy}>Save table</button><button type="button" onClick={()=>setTable(null)}>Cancel</button></form>}<div className="gridqr">{form.tables.map((t:any)=><TableCard key={t.token} table={t} onEdit={canEdit?()=>setTable(t):undefined}/>)}</div></>}</>:<p>No feedback forms for this business unit yet.</p>}</>}</div>;
}

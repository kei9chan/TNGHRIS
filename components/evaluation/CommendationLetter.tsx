import React from 'react';
import {LetterSnapshot} from '../../services/commendationService';
export default function CommendationLetter({data:s}:{data:LetterSnapshot}) {
 return <article className="mx-auto w-full max-w-3xl border-l-[14px] bg-[#fffdf8] px-7 py-10 sm:px-12" style={{borderColor:s.brand.accent,color:s.brand.textColor}}>
  {s.brand.logo?<img src={s.brand.logo} alt={s.brand.wordmark} className="mb-12 max-h-20 max-w-52 object-contain"/>:<p className="mb-12 text-3xl font-black">{s.brand.wordmark}</p>}
  <h2 className="text-2xl font-black sm:text-3xl">LETTER OF COMMENDATION</h2><h3 className="mt-4 text-xl font-semibold">{s.awardTitle}</h3>
  <p className="my-8">{new Date(s.awardDate+'T12:00:00').toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}</p>
  <p className="mb-5">Dear {s.employeeName},</p><p className="mb-5 whitespace-pre-wrap leading-7">{s.brand.opening}</p>
  <p className="mb-5 whitespace-pre-wrap leading-7">{s.citation}</p><p className="whitespace-pre-wrap leading-7">{s.brand.closing}</p>
  <div className="mt-16 grid gap-8 sm:grid-cols-2">{[{...s.issuer,label:'Awarded by'},...s.approvers.map(p=>({...p,label:'Approved by'}))].map((p,i)=><div key={`${p.id}-${i}`}><p className="mb-4">{p.label}</p>{s.brand.signatures?.find(sig=>sig.userId===p.id)?.image&&<img className="h-12 max-w-40 object-contain" alt={`Authorized signature of ${p.name}`} src={s.brand.signatures.find(sig=>sig.userId===p.id)!.image}/>}<div className="border-t border-gray-400 pt-2"><b>{p.name}</b><p>{p.position}</p></div></div>)}</div>
  <p className="mt-12 text-xs opacity-60">{s.businessUnit} · Template version {s.templateVersion}{s.fallback?' · Corporate template':''}</p>
 </article>;
}

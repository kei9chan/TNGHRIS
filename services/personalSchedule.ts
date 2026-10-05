import type {SchedulePublication} from './schedulePublicationService';
export function moveScheduleWeek(date:string,days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function currentScheduleWeek(){const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const d=new Date(date+'T12:00:00Z');return moveScheduleWeek(date,-((d.getUTCDay()+6)%7));}
export function publishedScheduleForDisplay(current:SchedulePublication|null,next:SchedulePublication|null,week:string){
 if(current?.activeVersion)return {week,row:current,upcoming:false};
 if(next?.activeVersion)return {week:moveScheduleWeek(week,7),row:next,upcoming:true};
 return {week,row:current,upcoming:false};
}
export function personalScheduleDays(row:SchedulePublication|null,week:string){
 // Only the active, approved publication snapshot. Never draft/latest pending contents.
 const entries=row?.activeVersion?row.before||[]:[];
 return Array.from({length:7},(_,i)=>{const date=moveScheduleWeek(week,i);return {date,entries:entries.filter(e=>e.date===date).map(e=>({name:e.name,time:e.kind==='rest'||e.kind==='no_schedule'?'':e.flexible?`Flexible shift${e.paidMinutes?` · ${e.paidMinutes/60} working hours`:''}`:`${e.start?.slice(0,5)} – ${e.end?.slice(0,5)}${e.endDayOffset?` (+${e.endDayOffset} day)`:''}`}))};});
}

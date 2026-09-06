import type {ShiftTemplate} from '../types';
export const COMPANY_GRACE_MINUTES=5;
export const UNPAID_LUNCH_MINUTES=60;
export function validateScheduleTemplate(t:Partial<ShiftTemplate>):string|null{
 if(!t.name?.trim())return 'Enter the preset name.';
 if(t.scheduleKind&&t.scheduleKind!=='work')return null;
 if(t.isFlexible){if(!Number.isInteger(t.paidMinutes)||t.paidMinutes!<=0||t.paidMinutes!>1380)return 'Enter paid hours per day, excluding the unpaid lunch.';}
 else {const start=t.startTime?.slice(0,5),end=t.endTime?.slice(0,5);if(!start||!end||start===end)return 'Enter distinct start and end times.';
 if(end<start&&t.endDayOffset!==1)return 'Confirm that this overnight shift ends the next day.';
 if(end>start&&t.endDayOffset===1)return 'This next-day shift would exceed 24 hours. Check the times.';
 const mins=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3,5));if(mins(end)-mins(start)+(t.endDayOffset??0)*1440<=60)return 'Shift must include paid time after the 60-minute lunch.';}
 return null;
}
export function scheduleLabel(t:Partial<ShiftTemplate>):string{
 if(t.scheduleKind==='rest')return 'Rest Day';if(t.scheduleKind==='no_schedule')return 'Leave / No Schedule';
 if(t.isFlexible)return t.paidMinutes?`Flexible · ${t.paidMinutes/60} paid hours`:'Flexible · paid hours missing';
 return `${t.startTime?.slice(0,5)??'?'}–${t.endTime?.slice(0,5)??'?'}${t.endDayOffset===1?' (+1 day)':t.endTime&&t.startTime&&t.endTime<t.startTime?' (next day needs confirmation)':''}`;
}

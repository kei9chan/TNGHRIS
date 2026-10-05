import type {SchedulePublication} from './schedulePublicationService';

type PublicationState=Pick<SchedulePublication,'published'|'pending'|'activeVersion'>;

export function schedulePublicationSummary(rows:PublicationState[],expected:number){
 const live=rows.filter(row=>row.published).length;
 const pending=rows.filter(row=>row.pending).length;
 const previous=rows.filter(row=>row.activeVersion&&!row.published).length;
 if(!expected)return {kind:'empty' as const,title:'NO EMPLOYEES IN VIEW',detail:'Choose a business unit or employee group to check publication status.',live};
 if(rows.length!==expected)return {kind:'unknown' as const,title:'PUBLICATION STATUS UNAVAILABLE',detail:`Could only verify ${rows.length} of ${expected} employees in this view. Refresh before relying on this status.`,live};
 if(live===expected)return {kind:'live' as const,title:'PUBLISHED & LIVE',detail:`All ${expected} employees in this view have current published schedules. Employees can see this week in My Published Schedule.`,live};
 if(live>0)return {kind:'partial' as const,title:'PARTLY PUBLISHED',detail:`${live} of ${expected} employees in this view have current published schedules. ${expected-live} still need publication or approval${previous?`; ${previous} retain an earlier published version`:''}.`,live};
 if(pending)return {kind:'pending' as const,title:'AWAITING APPROVAL',detail:`${pending} of ${expected} schedules await HR review${previous?`; ${previous} employees still see their earlier published version`:''}. New changes are not live yet.`,live};
 if(previous)return {kind:'changes' as const,title:'CHANGES NOT PUBLISHED',detail:`${previous} of ${expected} employees still see an earlier published version. The current changes are not live.`,live};
 return {kind:'draft' as const,title:'NOT YET PUBLISHED',detail:`0 of ${expected} employees in this view have a live schedule for this week. Save and review the schedules, then publish them.`,live};
}

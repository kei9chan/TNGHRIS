import {Role,User} from '../../types';

export type ScheduleScope='direct'|'all'|`business_unit:${string}`;

const globalViewRoles=new Set<Role>([Role.Admin,Role.BOD,Role.GeneralManager,Role.HRManager,Role.HRStaff]);
const reconciliationRoles=new Set<Role>([Role.Admin,Role.BOD,Role.HRManager,Role.HRStaff]);

const roles=(user?:User|null)=>user?[user.role,...(user.roles??[])]:[];
export const canViewAllScheduleUnits=(user?:User|null)=>roles(user).some(role=>globalViewRoles.has(role));
export const canUseHistoricalReconciliation=(user?:User|null)=>roles(user).some(role=>reconciliationRoles.has(role));
export const canImportActualAttendance=(user?:User|null)=>roles(user).some(role=>reconciliationRoles.has(role));
export const scopeBusinessUnitId=(scope:ScheduleScope)=>scope.startsWith('business_unit:')?scope.slice('business_unit:'.length):null;
export const scopeLabel=(scope:ScheduleScope,businessUnits:{id:string;name?:string}[])=>scope==='direct'?'My direct reports':scope==='all'?'All business units':businessUnits.find(unit=>unit.id===scopeBusinessUnitId(scope))?.name||'Business unit';

// The schedule grid can show direct reports or all units, while each preset
// must belong to exactly one unit. Prefer the manager's own unit in those views.
export const presetBusinessUnitId=(scheduleUnit:string,chosenUnit:string,ownUnit:string|undefined,units:{id:string}[])=>{
  if(scheduleUnit!=='all')return units.some(unit=>unit.id===scheduleUnit)?scheduleUnit:null;
  if(chosenUnit&&units.some(unit=>unit.id===chosenUnit))return chosenUnit;
  if(ownUnit&&units.some(unit=>unit.id===ownUnit))return ownUnit;
  return units.length===1?units[0].id:null;
};

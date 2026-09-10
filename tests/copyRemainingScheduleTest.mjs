import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const source=fs.readFileSync('pages/payroll/Timekeeping.tsx','utf8');
const handler=source.slice(source.indexOf('    const handleCopyWeek ='),source.indexOf('    const copyWeek='));
const code=transformSync(handler+'\nglobalThis.run=handleCopyWeek;', {loader:'ts',target:'es2022'}).code;
const date=s=>new Date(s+'T00:00:00');
async function scenario({failure=false,locked=false}={}) {
 let payload=[],audits=0,notice='';
 const context={Date,console,savingShift:{current:locked},scheduleMutation:{current:0},isScheduleEditable:true,
 hasScopedPreset:()=>true,rejectLegacyCopy:()=>{},getDayStatuses:async()=>[{work_date:'2026-09-12',tag:'rest'}],
 weekStart:date('2026-09-07'),weekDates:Array.from({length:7},(_,i)=>date(`2026-09-${String(7+i).padStart(2,'0')}`)),
 toDateOnly:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,leaveForDay:(ls,id,d)=>ls.find(l=>l.employeeId===id&&d.getDate()===11),addDays:(d,n)=>new Date(d.getTime()+n*86400000),
 assignments:[],leaves:[{employeeId:'employee',status:'Approved',startDate:'2026-09-11',endDate:'2026-09-11'}],LeaveRequestStatus:{Approved:'Approved'},
 employees:[{id:'employee'}],resolveAssignmentBuId:()=> 'bu',user:{id:'manager'},window:{confirm:()=>true},
 setAssignments:()=>{},setScheduleStatus:()=>{},logActivity:()=>audits++,setPublicationRefresh:()=>{},setStatusRefresh:()=>{},
 setToastInfo:v=>notice=v.message,handleCloseDetailModal:()=>{},handleCloseDrawer:()=>{},
 supabase:{from:()=>({select:()=>({eq:()=>({gte:()=>({lte:async()=>({data:[{date:'2026-09-10'}],error:null})})})}),insert:rows=>{payload=rows;return{select:async()=>failure?{data:null,error:{message:'Database unavailable'}}:{data:rows.map((r,i)=>({...r,id:String(i)})),error:null}}}})} };
 vm.createContext(context);vm.runInContext(code,context);
 await context.run({employeeId:'employee',shiftTemplateId:'preset',date:date('2026-09-09'),assignedAreaId:'area'});
 return {payload,audits,notice,context};
}
const ok=await scenario();
assert.deepEqual(Array.from(ok.payload,r=>r.date),['2026-09-13']);
assert.equal(ok.payload[0].assigned_area_id,'area');
assert.equal(ok.audits,1);assert.match(ok.notice,/saved as drafts/);assert.equal(ok.context.savingShift.current,false);
const failed=await scenario({failure:true});assert.equal(failed.audits,0);assert.equal(failed.notice,'Database unavailable');assert.equal(failed.context.savingShift.current,false);
const locked=await scenario({locked:true});assert.equal(locked.payload.length,0);
console.log('PASS: later dates only; saved shift, approved leave and rest day preserved; area retained; database failure and double-click guarded.');

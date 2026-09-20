export type PayrollCycle={releaseDate:string;from:string;to:string;kind:'5th'|'20th'};

const iso=(date:Date)=>date.toISOString().slice(0,10);
const utc=(year:number,month:number,day:number)=>new Date(Date.UTC(year,month,day));
const parts=(value:string)=>{const [year,month,day]=value.split('-').map(Number);return {year,month:month-1,day};};
export const formatPayrollDate=(value:string)=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'long',day:'numeric',year:'numeric'}).format(utc(parts(value).year,parts(value).month,parts(value).day));
export const formatCutoff=(from:string,to:string)=>{const a=parts(from),b=parts(to);const month=new Intl.DateTimeFormat('en-PH',{month:'long',timeZone:'Asia/Manila'});return a.year===b.year&&a.month===b.month?`${month.format(utc(a.year,a.month,1))} ${a.day}–${b.day}, ${a.year}`:`${month.format(utc(a.year,a.month,1))} ${a.day}–${month.format(utc(b.year,b.month,1))} ${b.day}, ${b.year}`;};

export function payrollCycleForRelease(releaseDate:string):PayrollCycle{
 const {year,month,day}=parts(releaseDate);
 if(day===5)return {releaseDate,from:iso(utc(year,month-1,11)),to:iso(utc(year,month-1,25)),kind:'5th'};
 if(day===20)return {releaseDate,from:iso(utc(year,month-1,26)),to:iso(utc(year,month,10)),kind:'20th'};
 throw new Error('Standard payroll releases must fall on the 5th or 20th.');
}

export function defaultPayrollCycle(now=new Date()):PayrollCycle{
 const values=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>Number(values.find(part=>part.type===type)?.value);const year=value('year'),month=value('month')-1,day=value('day');
 return payrollCycleForRelease(iso(day<=5?utc(year,month,5):day<=20?utc(year,month,20):utc(year,month+1,5)));
}

export function payrollCycleOptions(anchor=new Date(),pastMonths=5,futureMonths=4){
 const current=defaultPayrollCycle(anchor),p=parts(current.releaseDate),cycles:PayrollCycle[]=[];
 for(let offset=-pastMonths;offset<=futureMonths;offset++)for(const day of [5,20])cycles.push(payrollCycleForRelease(iso(utc(p.year,p.month+offset,day))));
 return cycles.sort((a,b)=>a.releaseDate.localeCompare(b.releaseDate));
}

export const payrollCycleLabel=(cycle:PayrollCycle)=>`${formatPayrollDate(cycle.releaseDate)} Payroll · Cutoff ${formatCutoff(cycle.from,cycle.to)}`;
export function payrollCycleForCutoff(from:string,to:string){return payrollCycleOptions(new Date(`${to||from||'2026-01-01'}T12:00:00Z`),18,18).find(cycle=>cycle.from===from&&cycle.to===to)||null;}
export const isDateWithinCycle=(date:string,cycle:Pick<PayrollCycle,'from'|'to'>)=>date>=cycle.from&&date<=cycle.to;


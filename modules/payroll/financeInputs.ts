import {contributionKeys, type NetInputs, type NetEmployee, type NetWorkspace} from './netPay';
export const financeFields=[
 ['sssBase','SSS monthly salary base','money','Contributions'],['philhealthBase','PhilHealth monthly salary base','money','Contributions'],['pagibigBase','Pag-IBIG monthly salary base','money','Contributions'],
 ['sssCovered','SSS coverage','boolean','Contributions'],['philhealthCovered','PhilHealth coverage','boolean','Contributions'],['pagibigCovered','Pag-IBIG coverage','boolean','Contributions'],
 ['openingTaxable','Earlier taxable pay this year','money','Earlier payroll'],['openingWithheld','Earlier tax withheld this year','money','Earlier payroll'],['openingPeriods','Earlier semi-monthly payroll count (0–23)','count','Earlier payroll'],['previousEmployer','Previous employer this year','boolean','Earlier payroll'],['cumulativeAlready','Cumulative tax method already used','boolean','Earlier payroll'],
 ['openingRef','Earlier payroll record / reference','text','Earlier payroll'],['sourceRef','Contribution / benefit source','text','Contributions'],['coverageRef','Authority for coverage exclusion','text','Contributions'],
 ...contributionKeys.map(k=>['openingContributions.'+k,({sssEE:'SSS employee',sssER:'SSS employer',mpfEE:'Pension fund employee',mpfER:'Pension fund employer',ecER:'Employees compensation employer',philhealthEE:'PhilHealth employee',philhealthER:'PhilHealth employer',pagibigEE:'Pag-IBIG employee',pagibigER:'Pag-IBIG employer'}[k])+' paid earlier this month','money','Earlier contributions'])
] as readonly (readonly string[])[];
export function fieldValue(e:NetEmployee,k:string):string|boolean{return k.startsWith('openingContributions.')?e.openingContributions[k.split('.')[1]]??'':(e as unknown as Record<string,string|boolean>)[k]??'';}
export function fieldRequired(e:NetEmployee,p:NetInputs,k:string){
 if(k==='coverageRef')return [e.sssCovered,e.philhealthCovered,e.pagibigCovered].some(x=>x===false);
 if(k.startsWith('openingContributions.'))return p.cutoff==='2'&&!p.previousRunId;
 return true;
}
export function validField(v:unknown,kind:string){return kind==='boolean'?typeof v==='boolean':kind==='count'?/^([0-9]|1[0-9]|2[0-3])$/.test(String(v)):kind==='money'?/^\d+(\.\d{1,2})?$/.test(String(v))&&Number(v)<=999999999:typeof v==='string'&&v.trim().length>=3;}
export function updateField(e:NetEmployee,k:string,v:string|boolean):NetEmployee{return k.startsWith('openingContributions.')?{...e,openingContributions:{...e.openingContributions,[k.split('.')[1]]:String(v)}}:{...e,[k]:v};}
export function financeIssues(w:NetWorkspace,p:NetInputs){return p.employees.map(e=>{
 const labels=financeFields.filter(([k,,kind])=>fieldRequired(e,p,k)&&!validField(fieldValue(e,k),kind)).map(([,label])=>label);
 const original=w.gross.result.employees.find(x=>x.employeeId===e.employeeId)!;
 if(e.taxLines.length!==original.lines.length||e.taxLines.some((t,i)=>!validTax(t.taxable,original.lines[i]?.amount)||!['regular','supplement'].includes(t.kind)||(Number(t.taxable)!==Number(original.lines[i]?.amount)&&t.exemptionRef.trim().length<3)))labels.push('Tax treatment of earnings');
 return {employeeId:e.employeeId,name:original.employeeName,labels};
}).filter(x=>x.labels.length);}
function validTax(v:string,gross:string){return /^-?\d+(\.\d{1,2})?$/.test(v)&&Number(v)>=Math.min(0,Number(gross))&&Number(v)<=Math.max(0,Number(gross));}
export function cents(v:string){if(!/^-?\d+(\.\d{1,2})?$/.test(v))throw new Error('Enter an amount with at most 2 decimals.');const [a,b='']=v.replace('-','').split('.');return (BigInt(a)*100n+BigInt(b.padEnd(2,'0')))*(v.startsWith('-')?-1n:1n);}
export function money(n:bigint){const a=n<0n?-n:n;return `${n<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`;}
export function taxGroups(w:NetWorkspace,e:NetEmployee){
 const original=w.gross.result.employees.find(x=>x.employeeId===e.employeeId)!;
 const groups=new Map<string,{label:string;indexes:number[];gross:bigint;taxable:string;kind:string;exemptionRef:string;treatment:string}>();
 original.lines.forEach((l,i)=>{const t=e.taxLines[i];const treatment=w.packageTerms?.find(x=>x.employeeId===e.employeeId)?.taxLines[i]?.treatment||'unreviewed';const key=JSON.stringify([l.label,treatment,Number(l.amount)<0,t?.kind,t?.exemptionRef]);let g=groups.get(key);if(!g){g={label:l.label,indexes:[],gross:0n,taxable:'0.00',kind:t?.kind||'regular',exemptionRef:t?.exemptionRef||'',treatment};groups.set(key,g);}g.indexes.push(i);g.gross+=cents(l.amount);g.taxable=g.taxable!==''&&t?.taxable!==''&&t?.taxable!==undefined?money(cents(g.taxable)+cents(t.taxable)):'';});return [...groups.values()];
}
export function updateTaxGroup(w:NetWorkspace,e:NetEmployee,g:ReturnType<typeof taxGroups>[number],value:string,kind:string,ref:string){
 const total=cents(value);if(!validTax(value,money(g.gross)))throw new Error('Taxable earnings must be between zero and this pay amount.');
 if((g.treatment==='included'&&total!==g.gross)||(g.treatment==='excluded'&&total!==0n))throw new Error('Keep the approved package tax treatment.');
 const original=w.gross.result.employees.find(x=>x.employeeId===e.employeeId)!;const taxLines=[...e.taxLines];let assigned=0n,weight=0n;
 g.indexes.forEach(i=>{weight+=cents(original.lines[i].amount);const cumulative=g.gross===0n?0n:total*weight/g.gross;taxLines[i]={taxable:money(cumulative-assigned),kind,exemptionRef:ref};assigned=cumulative;});return {...e,taxLines};
}

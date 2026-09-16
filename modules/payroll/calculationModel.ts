import type {CompareInput,CompareTemplate,Comparison} from './pilot';
export type CalculationSelection={grossId:string;netId:string};
export const calculationKey=(user:string,scope:string,from:string,to:string)=>`payroll-calculation-v1:${user}:${scope}:${from}:${to}`;
export function parseCalculationSelection(raw:string|null):CalculationSelection {
 try {const v=JSON.parse(raw||'{}');return {grossId:typeof v.grossId==='string'?v.grossId:'',netId:typeof v.netId==='string'?v.netId:''};}catch{return {grossId:'',netId:''};}
}
export function selectGross(previous:CalculationSelection,grossId:string):CalculationSelection {return {grossId,netId:previous.grossId===grossId?previous.netId:''};}
export function consecutiveCutoffs(firstTo:string,secondFrom:string){return /^\d{4}-\d{2}-\d{2}$/.test(firstTo)&&/^\d{4}-\d{2}-\d{2}$/.test(secondFrom)&&Date.parse(secondFrom)-Date.parse(firstTo)===86400000;}
// Presentation-only decimal subtraction. Payroll amounts remain the existing SQL engine's output.
export function difference(system:string,legacy:string){
 const cents=(s:string)=>{if(!/^-?\d+(\.\d{1,2})?$/.test(s))throw new Error('A reviewed amount is missing or invalid. Blank is not zero.');const [whole,fraction='']=s.replace('-','').split('.');return (BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(s.startsWith('-')?-1n:1n);};
 const n=cents(system)-cents(legacy),a=n<0n?-n:n;return `${n<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`;
}
export type DifferenceRow=Comparison['rows'][number];
export function previewDifferences(t:CompareTemplate,input:CompareInput):DifferenceRow[]{
 const imported=new Map(input.rows.map(r=>[`${r.employeeId}/${r.key}`,r]));
 return t.rows.map(r=>{const v=imported.get(`${r.employeeId}/${r.key}`);if(!v)throw new Error(`Missing comparison for ${r.employeeName}: ${r.label}`);const delta=difference(r.amount,v.legacyAmount);return {...r,...v,difference:delta,resolved:delta==='0.00'||(v.explanation.trim().length>=3&&v.policyRef.trim().length>=3)};});
}
export function employeeDifferences(rows:DifferenceRow[]){const result=new Map<string,{id:string;name:string;rows:DifferenceRow[]}>();for(const row of rows){if(!result.has(row.employeeId))result.set(row.employeeId,{id:row.employeeId,name:row.employeeName,rows:[]});result.get(row.employeeId)!.rows.push(row);}return [...result.values()];}

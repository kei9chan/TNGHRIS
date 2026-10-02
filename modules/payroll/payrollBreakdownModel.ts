import type {GrossLine} from './grossPay';
export type BreakdownCategory='basic'|'overtime'|'premium'|'night'|'unpaid'|'benefits'|'rounding';
export const breakdownLabels:Record<BreakdownCategory,string>={basic:'Basic pay',overtime:'Approved overtime',premium:'Worked-day premium',night:'Night differential',unpaid:'Unpaid minutes',benefits:'Benefits & other earnings',rounding:'Rounding adjustment'};
export function amountCents(value:string):bigint{if(!/^-?\d+(\.\d{1,2})?$/.test(value))throw new Error('Invalid saved payroll amount');const [whole,decimal='']=value.replace('-','').split('.');return (BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0')))*(value.startsWith('-')?-1n:1n);}
export function pesoCents(n:bigint){return `${n<0n?'-':''}₱${(n<0n?-n:n)/100n}`.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+String((n<0n?-n:n)%100n).padStart(2,'0');}
export function categoryFor(line:GrossLine):BreakdownCategory{
 const label=line.label.toLowerCase();
 if(label.includes('rounding'))return 'rounding';
 if(label.includes('unpaid'))return 'unpaid';
 if(label.includes('night'))return 'night';
 if(label.includes('overtime')||label.includes('offset minutes'))return 'overtime';
 if(label.includes('premium'))return 'premium';
 if(label.includes('basic')||label.includes('regular base'))return 'basic';
 return 'benefits';
}
export function breakdownGroups(lines:GrossLine[]){
 const groups=new Map<string,{key:string;category:BreakdownCategory;label:string;adjustment:boolean;amount:bigint;lines:GrossLine[]}>();
 for(const line of lines){const category=categoryFor(line),amount=amountCents(line.amount);const adjustment=amount<0n||category==='unpaid'||category==='rounding';const key=category+(adjustment?'-adjustment':'-earning');let group=groups.get(key);if(!group){group={key,category,label:breakdownLabels[category],adjustment,amount:0n,lines:[]};groups.set(key,group);}group.amount+=amount;group.lines.push(line);}
 return [...groups.values()];
}
export function lineUnits(line:GrossLine){
 const n=Number(line.quantity);if(!Number.isFinite(n))return '—';const fmt=(v:number)=>v.toLocaleString('en-PH',{maximumFractionDigits:2});
 if(line.label.toLowerCase().includes('calendar-prorated semi-monthly basic'))return '1 paid day';
 if(categoryFor(line)==='unpaid')return `${fmt(n*60)} minutes`;
 if(['basic','overtime','premium','night'].includes(categoryFor(line)))return `${fmt(n)} hours`;
 return `${fmt(n)} units`;
}
export function lineRate(line:GrossLine){
 if(line.label.toLowerCase().includes('calendar-prorated semi-monthly basic'))return pesoCents(amountCents(line.amount))+' / day';
 const n=Number(line.rate);return Number.isFinite(n)?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n):'—';
}

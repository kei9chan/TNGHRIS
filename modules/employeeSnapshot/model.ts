export const isBod = (user?: {role?:string;roles?:string[]}|null) => Boolean(user && (user.roles?.length ? user.roles : [user.role]).includes('Board of Director'));
export const money = (value:unknown) => value===null||value===undefined||value===''||!Number.isFinite(Number(value)) ? 'Unavailable' : new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(value));
export function tenure(hired?:string|null,end?:string|null,status?:string,asOf?:string):string {
 if(!hired||!asOf||(status?.toLowerCase()!=='active'&&!end))return 'Tenure unavailable';
 const start=new Date(hired+'T00:00:00Z'), finish=new Date((end&&end<asOf?end:asOf)+'T00:00:00Z');
 if(!Number.isFinite(+start)||!Number.isFinite(+finish)||finish<start)return 'Tenure unavailable';
 let months=(finish.getUTCFullYear()-start.getUTCFullYear())*12+finish.getUTCMonth()-start.getUTCMonth();
 if(finish.getUTCDate()<start.getUTCDate())months--;
 const years=Math.floor(months/12),remaining=months%12;
 return months<=0?'Less than 1 month with TNG':`${years?`${years} year${years===1?'':'s'} `:''}${remaining?`${remaining} month${remaining===1?'':'s'} `:''}with TNG`;
}
export const taxCopy:Record<string,string>={
 'Gross':'GROSS — Income tax is deducted from employee pay',
 'Net of tax':'NET OF TAX — Company shoulders income tax',
 'Not configured':'NOT CONFIGURED — Tax arrangement needs confirmation',
};
export type Identity={id:string;name:string;code:string|null;position:string|null;department:string|null;businessUnit:string|null;businessUnitId:string|null;status:string;employmentStatus:string|null;hired:string|null;endDate:string|null;asOf:string;reportsTo?:string|null;ordinal?:number};
export type Pay={state:string;amount:number|null;unit:string|null;tax:string;shares:string;reason:string;referenceAmount?:number|null;referenceUnit?:string;packages?:{id:string;stream:string;engagement:string;effectiveFrom:string;unit:string;base:number;payBasis:string|null;netTarget:string|null;components:{name:string;amount:string;recurrence:string;payableDate?:string}[]}[]};
export type Evaluation={state:string;score?:number|null;id?:string;name?:string;scale?:number;period?:string|null;reason:string;label?:string|null;summary?:string|null};
export type Summary=Identity&{pay:Pay;evaluation:Evaluation;openNtes:number|null;cost:number|null;serviceCharge:string};
export type Directory={items:Summary[];total:number;offset:number;limit:number;updatedAt:string;sortNote:string|null};
export type Snapshot={identity:Identity;pay:Pay;cost:{state:string;amount:number|null;reason:string;recordedError?:string;recorded?:{from:string;to:string;gross:string;employer:string;total:number;topUp?:string;tax:string;employeeShares:string;payBasis?:string;label:string}};
 serviceCharge:{eligibility:string;reason:string};evaluation:Evaluation;attendance:{state:string;reason:string;period?:string;from?:string;to?:string;late?:number;approvedLeave?:number;exceptions?:number;unexcusedAbsences?:number|null};
 cases:{state:string;reason?:string;open?:number;closed?:number;unissued?:number;items?:{id:string;issuedAt:string|null;recordedAt:string;subject:string;status:string;rawStatus:string;summary:string;outcome:string|null;decisionDate:string|null}[]};updatedAt:string};
export type Filters={businessUnits:{id:string;name:string}[];departments:string[];employment:string[];types:string[]};

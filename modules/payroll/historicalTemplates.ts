export const historicalHeaders={
 punches:['Employee Code','Business Unit','Work Date','Punch Time','Event Type','Source Reference'],
 dtr:['Employee Code','Business Unit','Work Date','Regular Minutes','Overtime Minutes','Night Minutes','Late Minutes','Undertime Minutes','Unpaid Break Minutes','Review Reference'],
};
const csvCell=(v:string)=>'"'+v.replaceAll('"','""')+'"';
/** Blank values intentionally require the uploader to supply actual evidence. */
export function historicalTemplate(kind:keyof typeof historicalHeaders,businessUnit:string,employees:{code:string}[],workDate:string){
 const rows=employees.map(e=>kind==='punches'?[e.code,businessUnit,workDate,'','','']:[e.code,businessUnit,workDate,'','','','','','','']);
 return '\uFEFF'+[historicalHeaders[kind],...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

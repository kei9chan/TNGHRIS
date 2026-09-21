import {EmployeePayslip} from './selfService';
import {
  attendanceSummary,
  employeeDeductions,
  employeeEarnings,
  EmployeePayslipDocumentData,
  employerContributions,
  payslipStatus,
} from './payslipPresentation';

const amount = (value: unknown) => `PHP ${Number(value || 0).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const prettyDate = (value?: string) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'}) : 'Pending';

export async function buildStyledPayslipPdf(s: EmployeePayslipDocumentData, test = false) {
  const {jsPDF} = await import('jspdf');
  const pdf = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const navy=[16,39,87] as const, purple=[109,40,217] as const, slate=[71,85,105] as const;
  const earnings=employeeEarnings(s), deductions=employeeDeductions(s), employer=employerContributions(s), attendance=attendanceSummary(s), status=payslipStatus(s,test);
  let y=14;
  const text=(value:string,x:number,yy:number,size=9,bold=false,color:readonly[number,number,number]=navy)=>{pdf.setTextColor(...color);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.text(value,x,yy);};
  const center=(value:string,x:number,yy:number,size=9,bold=false,color:readonly[number,number,number]=navy)=>{pdf.setTextColor(...color);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.text(value,x,yy,{align:'center'});};
  const right=(value:string,x:number,yy:number,size=9,bold=false,color:readonly[number,number,number]=navy)=>{pdf.setTextColor(...color);pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.text(value,x,yy,{align:'right'});};
  const card=(x:number,yy:number,w:number,h:number,fill:readonly[number,number,number])=>{pdf.setFillColor(...fill);pdf.roundedRect(x,yy,w,h,3,3,'F');};
  text('TNG',14,y+7,25,true);text('HRIS',51,y+7,25,true,purple);right('PAYSLIP',196,y+7,24,true);text('PEOPLE WORK A BRIGHTER TOMORROW',14,y+14,6,false,slate);
  const badgeColor=status.official?[220,252,231] as const:[254,243,199] as const;card(126,y+11,70,9,badgeColor);right(status.label,193,y+17,8,true,status.official?[22,101,52]:[120,53,15]);
  y+=28;if(test){card(14,y,182,11,[255,247,214]);center('TEST PAYROLL — This document does not release payment or submit government records.',105,y+7,8,true,[120,53,15]);y+=17;}
  text(s.employeeName,14,y,18,true);text(`Employee No.  ${s.employeeNumber||s.employeeCode||'Pending'}`,14,y+8,9);text(`Business Unit  ${s.businessUnit||'Pending'}`,14,y+14,9);if(s.department)text(`Department  ${s.department}`,14,y+20,9);
  text(`Payroll Period  ${prettyDate(s.from)} – ${prettyDate(s.to)}`,112,y+2,9);text(`Payroll Cutoff  ${prettyDate(s.from)} – ${prettyDate(s.to)}`,112,y+8,9);text(`Pay Date  ${prettyDate(s.payDate)}`,112,y+14,9);text(`Status  ${s.payrollStatus||s.status||(test?'Test payroll':'Approved')}`,112,y+20,9);
  y+=27;pdf.setDrawColor(...navy);pdf.setLineWidth(.6);pdf.line(14,y,196,y);y+=7;
  const summaries=[['GROSS PAY',s.gross,[239,246,255] as const],['TOTAL DEDUCTIONS',s.deductions,[255,241,242] as const],['NET PAY',s.net,[25,45,96] as const]] as const;
  summaries.forEach(([label,value,fill],i)=>{const x=14+i*62;card(x,y,58,25,fill);const light=i===2;text(label,x+5,y+7,8,true,light?[235,232,255]:navy);text(amount(value),x+5,y+18,i===2?15:13,true,light?[255,255,255]:navy);});y+=32;
  const table=(title:string,rows:{label:string;amount:number;units?:string}[],totalLabel:string,total:unknown,x:number,w:number)=>{if(!rows.length)return;card(x,y,w,9,[242,238,255]);text(title.toUpperCase(),x+4,y+6,9,true,purple);let yy=y+14;rows.forEach(row=>{const labelLines=pdf.splitTextToSize(row.label,42);labelLines.forEach((part:string,index:number)=>text(part,x+4,yy+(index*4),8));if(row.units)text(row.units,x+w-40,yy,7,false,slate);right(amount(row.amount),x+w-4,yy,8,true);yy+=Math.max(6,labelLines.length*4+2);});pdf.setDrawColor(220,225,233);pdf.line(x+4,yy-2,x+w-4,yy-2);text(totalLabel,x+4,yy+4,8,true);right(amount(total),x+w-4,yy+4,9,true);return yy+8;};
  const leftEnd=table('Earnings',earnings,'Total Earnings',s.gross,14,88)||y, rightEnd=table('Deductions',deductions,'Total Deductions',s.deductions,108,88)||y;y=Math.max(leftEnd,rightEnd)+5;
  if(attendance.length){card(14,y,88,9,[239,246,255]);text('ATTENDANCE SUMMARY',18,y+6,9,true);let yy=y+14;attendance.forEach(row=>{text(row.label,18,yy,8);right(row.value,98,yy,8,true);yy+=6;});y=yy+2;}
  if(employer.length){card(108,y-(attendance.length?attendance.length*6+11:0),88,9,[242,238,255]);const start=y-(attendance.length?attendance.length*6+11:0);text('EMPLOYER CONTRIBUTIONS',112,start+6,9,true,purple);let yy=start+14;employer.forEach(row=>{text(row.label,112,yy,8);right(amount(row.amount),192,yy,8,true);yy+=6;});text('Paid by the company — not deducted from net pay',112,yy+2,7,false,slate);y=Math.max(y,yy+7);}
  y=Math.min(Math.max(y+4,220),240);card(14,y,182,17,[248,250,252]);text('HOW YOUR PAY WAS CALCULATED',18,y+6,8,true);text('View detailed payroll calculation in HRIS. Technical calculation data is available only to authorized payroll users.',18,y+12,7,false,slate);
  y+=24;pdf.setDrawColor(...navy);pdf.line(14,y,196,y);text('I acknowledge receipt of this payslip and understand that the detailed calculation is available in HRIS.',14,y+8,8,true);pdf.setDrawColor(148,163,184);pdf.line(18,y+24,104,y+24);pdf.line(120,y+24,166,y+24);text('Employee Signature over Printed Name',38,y+29,7,false,slate);text('Date',135,y+29,7,false,slate);right('CONFIDENTIAL',196,y+8,7,true,slate);
  return pdf;
}

export const buildPayslipPdf = (s: EmployeePayslip) => buildStyledPayslipPdf(s, false);
export async function downloadPayslip(s: EmployeePayslip){const pdf=await buildPayslipPdf(s);pdf.save(`Payslip-${s.from}-${s.to}-v${s.version}.pdf`);}

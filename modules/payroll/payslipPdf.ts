import {EmployeePayslip,money} from './selfService';
import {payslipGroups} from './PayslipView';
export async function buildPayslipPdf(s:EmployeePayslip){
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF();let y=18;
 const line=(text:string,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');const parts=pdf.splitTextToSize(text,174);for(const part of parts){if(y>278){pdf.addPage();y=18;}pdf.text(part,18,y);y+=6;}};
 pdf.setFontSize(12);line(`TNG HRIS | ${s.correctionKind==='revised'?'Revised ':s.correctionKind==='adjustment'?'Adjustment ':''}Payslip`,true);
 line(s.employeeName);line(`Employee: ${s.employeeNumber||'Not captured'} | ${s.businessUnit||'Business unit not captured'}`);
 line(`Period: ${s.from} - ${s.to} | Pay date: ${s.payDate}`);line(`Status: ${s.payrollStatus} | Payroll version: ${s.version}`);
 line(`Payment: ${s.paymentStatus||'Released after payment'}`);y+=4;
 for(const g of payslipGroups(s)){line(g.title,true);for(const l of g.lines){line(`${l.label}: PHP ${Number(l.remaining??l.amount??0).toFixed(2)}`);const info=[l.date&&`Date ${l.date}`,l.quantity!=null&&`Quantity ${l.quantity}`,l.rate!=null&&`Rate ${l.rate}`,l.factor!=null&&`Multiplier ${l.factor}`].filter(Boolean).join(' | ');if(info)line(info);}y+=3;}
 for(const [k,v] of [['Gross pay',s.gross],['Total deductions',s.deductions],['Net pay',s.net]])line(`${k}: ${money(v).replace('₱','PHP ')}`,true);
 line(`Released snapshot ${s.id}`);line(`Questions: ${s.contact||'Report an Issue in My Payslips'}`);
 return pdf;
}

export async function downloadPayslip(s:EmployeePayslip){const pdf=await buildPayslipPdf(s);pdf.save(`Payslip-${s.from}-${s.to}-v${s.version}.pdf`);}

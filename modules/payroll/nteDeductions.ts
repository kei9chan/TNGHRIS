import jsPDF from 'jspdf';
import {supabase} from '../../services/supabaseClient';

export type NTEScheduleRow={id:string;sequence_no:number;payroll_date:string;scheduled_amount:string;actual_amount:string|null;balance_after:string;status:string;excluded_reason:string|null};
export type NTEAuditRow={action:string;reason:string;actor:string;role:string;at:string;version:number;previousSchedule:unknown;newSchedule:unknown;payrollCutoff:string|null};
export type NTEDeduction={
 id:string;resolutionId:string;nteId:string;incidentReportId:string;nteNumber:string;employeeId:string;employeeName:string;
 workflowStatus:string;authorityStatus:string;atdVersion:number;canViewSensitive:boolean;generatedAt:string;employeeSignedAt:string|null;
 hrVerifiedAt:string|null;financeApprovedAt:string|null;generatedDocumentPath:string|null;generatedDocumentName:string|null;
 signedDocumentPath:string|null;signedDocumentName:string|null;approvedAmount?:string;currentBalance?:string;thisPayrollDeduction?:string;
 repaymentMethod?:'months'|'cutoffs';termCount?:number;cutoffCount?:number;installment?:string;firstDeductionDate?:string;
 expectedFinalDate?:string;finalInstallment?:string;remainingCutoffs?:number;reason?:string;approvedBasis?:string;terms?:Record<string,unknown>;
 schedule?:NTEScheduleRow[];audit?:NTEAuditRow[];payrollDate?:string;scheduledThisPayroll?:string;scheduleStatus?:string;
};
export type NTEContext={nteId:string;resolutionId:string|null;employeeId:string;employeeName:string;nteNumber:string;incidentReportId:string;
 nodAcknowledged:boolean;resolutionType:string|null;workflowStatus:string;canViewSensitive:boolean;isEmployee:boolean;canGenerate:boolean;
 canHrVerify:boolean;canFinanceApprove:boolean;debt:NTEDeduction|null};
export type NTEScopeContext={items:NTEDeduction[];payrollDate:string|null;locked:boolean};

async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await supabase.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
export const getNteDeductionContext=(nteId:string)=>rpc<NTEContext>('get_nte_deduction_context',{p_nte_id:nteId});
export const getNteDeductions=(scopeId:string,payrollDate:string|null=null)=>rpc<NTEScopeContext>('get_payroll_nte_deductions',{p_scope:scopeId,p_payroll_date:payrollDate});
export const getNteDeductionQueue=(grossId:string,payDate:string)=>rpc<NTEDeduction[]>('get_payroll_nte_deduction_queue',{p_gross_id:grossId,p_pay_date:payDate});
export const actNteDeduction=(nteId:string,action:string,reason:string='',payload:Record<string,unknown>={})=>rpc<NTEDeduction>('act_on_nte_deduction',{p_nte_id:nteId,p_action:action,p_reason:reason||null,p_payload:payload});
export const generateNteAtd=(nteId:string,method:'months'|'cutoffs',term:number,firstDate:string,reason:string)=>rpc<NTEDeduction>('generate_nte_authority_to_deduct',{p_nte_id:nteId,p_method:method,p_term:term,p_first:firstDate,p_reason:reason});
export const attachNteAtdDocument=(nteId:string,kind:'generated'|'signed',path:string,name:string)=>rpc<NTEDeduction>('attach_nte_atd_document',{p_nte_id:nteId,p_kind:kind,p_path:path,p_name:name});

function atdPdf(deduction:NTEDeduction){
 const doc=new jsPDF({unit:'mm',format:'a4'});const t=deduction.terms||{};let y=22;
 doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('AUTHORITY TO DEDUCT',105,y,{align:'center'});y+=12;
 doc.setFontSize(10);doc.setFont('helvetica','normal');
 const lines=[
  `Employee: ${deduction.employeeName}`,
  `Linked NTE: ${deduction.nteNumber}`,
  `Reason and approved basis: ${String(t.approvedBasis||deduction.approvedBasis||deduction.reason||'Recorded in the approved Notice of Decision')}`,
  `Total approved deduction: PHP ${String(t.total||deduction.approvedAmount||'0.00')}`,
  `Repayment method: ${String(t.method||deduction.repaymentMethod||'')} · ${String(t.term||deduction.termCount||'')} ${String(t.method||deduction.repaymentMethod||'')}`,
  `Payroll cutoffs: ${String(t.cutoffs||deduction.cutoffCount||'')}`,
  `Amount per payroll cutoff: PHP ${String(t.perCutoff||deduction.installment||'0.00')}`,
  `First deduction date: ${String(t.firstDate||deduction.firstDeductionDate||'')}`,
  `Expected final deduction date: ${String(t.finalDate||deduction.expectedFinalDate||'')}`,
  `Final installment: PHP ${String(t.finalInstallment||deduction.finalInstallment||'0.00')}`,
  `ATD version: ${deduction.atdVersion}`,
 ];
 for(const line of lines){const wrapped=doc.splitTextToSize(line,170);doc.text(wrapped,20,y);y+=wrapped.length*6;}
 y+=8;doc.text('I authorize the payroll deduction described above according to this repayment schedule.',20,y);y+=18;
 doc.line(20,y,85,y);doc.line(115,y,190,y);y+=5;doc.text('Employee acknowledgment / signature',20,y);doc.text('Date signed',115,y);y+=22;
 doc.line(20,y,85,y);doc.line(115,y,190,y);y+=5;doc.text('HR verification',20,y);doc.text('Finance approval',115,y);
 doc.setFontSize(8);doc.text('Acknowledgment of the Notice of Decision is not consent to this payroll deduction.',105,286,{align:'center'});
 return doc;
}
export function downloadNteAtd(deduction:NTEDeduction){atdPdf(deduction).save(`ATD-${deduction.nteNumber}-V${deduction.atdVersion}.pdf`);}
export async function uploadGeneratedNteAtd(deduction:NTEDeduction){
 const blob=atdPdf(deduction).output('blob');const name=`ATD-${deduction.nteNumber}-V${deduction.atdVersion}.pdf`;const path=`${deduction.id}/${deduction.atdVersion}/${name}`;
 const {error}=await supabase.storage.from('payroll-nte-atd').upload(path,blob,{contentType:'application/pdf',upsert:false});if(error&&!/already exists/i.test(error.message))throw new Error(error.message);
 return attachNteAtdDocument(deduction.nteId,'generated',path,name);
}
export async function uploadSignedNteAtd(deduction:NTEDeduction,file:File){
 if(file.size>10*1024*1024)throw new Error('Signed ATD must be 10 MB or smaller.');
 if(!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new Error('Upload a PDF, PNG, or JPEG signed ATD.');
 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-');const path=`${deduction.id}/${deduction.atdVersion}/signed-${crypto.randomUUID()}-${safe}`;
 const {error}=await supabase.storage.from('payroll-nte-atd').upload(path,file,{contentType:file.type,upsert:false});if(error)throw new Error(error.message);
 return attachNteAtdDocument(deduction.nteId,'signed',path,file.name);
}
export async function openNteAtdDocument(path:string){const tab=window.open('','_blank');if(tab)tab.opener=null;const {data,error}=await supabase.storage.from('payroll-nte-atd').createSignedUrl(path,60);if(error){tab?.close();throw new Error(error.message);}if(tab)tab.location.href=data.signedUrl;else throw new Error('Allow pop-ups to open the secured ATD.');}
export const ntePeso=(value:string|number|undefined)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);

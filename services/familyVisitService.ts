import { supabase } from './supabaseClient';

export type FamilyMember = { name: string; relationship: string };
export type FamilyVisit = {
 id: string; employee_id: string; employee_name: string; date_needed: string; status: string;
 submission_date: string; bod_approved_at?: string; hr_endorsed_at?: string; fulfilled_at?: string;
 family_visit: { destination_id?: string; destination_name?: string; brand?: string; family?: FamilyMember[];
 reference?: string; employee_number?: string; home_bu?: string; employment_status?: string; legacy?: boolean;
 restored?: boolean; withdrawn?: boolean; operations_acknowledged_at?: string; operations_acknowledged_by?: string;
 operational_note?: string; review_flag?: string; cancellation?: { status: string; reason: string; review_reason?: string } };
 eligibility?: {eligible:boolean; reason:string; used:number; pending:number; remaining_after_approval:number; conflict_id?:string};
 can_review: boolean; can_operate: boolean;
};
export type FamilyVisitData = {year:number;hr:boolean;draft?:{destination:string;date:string;family:FamilyMember[];entry:boolean;confirmed:boolean};employee:{id:string;name:string;number:string;home_bu:string;employment_status:string;eligible:boolean};destinations:{id:string;name:string;brand:string;color?:string}[];requests:FamilyVisit[]};
export async function saveFamilyVisitDraft(payload:NonNullable<FamilyVisitData['draft']>) {const {error}=await supabase.rpc('save_family_visit_draft',{p_payload:payload});if(error)throw error;}
export const familyVisitYear = () => Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Manila'}).format(new Date()));
export const isFamilyVisit = (name: string) => /family.*visit/i.test(name);
export const consumesVisit = (r: FamilyVisit) => ['Approved','Fulfilled'].includes(r.status) || Boolean(r.bod_approved_at && !r.family_visit.restored);
export const reservesVisit = (r: FamilyVisit) => consumesVisit(r) || r.status.startsWith('Pending');
export async function loadMyFamilyVisitSummary(employeeId:string) {
 const year=familyVisitYear();
 const {data,error}=await supabase.from('benefit_requests').select('status,bod_approved_at,family_visit').eq('employee_id',employeeId).not('family_visit','is',null).gte('date_needed',`${year}-01-01`).lte('date_needed',`${year}-12-31`);
 if(error)throw error;
 const rows=(data||[]) as FamilyVisit[];
 return {used:rows.filter(consumesVisit).length,pending:rows.filter(r=>r.status.startsWith('Pending')).length,unknown:rows.some(r=>consumesVisit(r)&&!r.family_visit.destination_id)};
}
export function visitStatus(r: FamilyVisit) {
 if (r.family_visit.withdrawn) return 'Withdrawn';
 if (r.family_visit.cancellation?.status === 'Pending HR Review') return 'Requires Review – Approved Visit Cancellation';
 if (r.family_visit.review_flag) return r.family_visit.review_flag === 'no_show' ? 'Requires Review – Visit Not Fulfilled' : 'Requires Review – Operations Discrepancy';
 if (r.status === 'Fulfilled') return 'Availed/Fulfilled';
 if (r.status === 'Approved') return r.family_visit.operations_acknowledged_at ? 'Operations Acknowledged' : 'Approved – Awaiting Visit';
 return r.status.startsWith('Pending') ? 'Pending Approval' : r.status;
}
export async function loadFamilyVisits(year=familyVisitYear()):Promise<FamilyVisitData> {
 const {data,error}=await supabase.rpc('get_family_visits',{p_year:year}); if(error)throw error; return data;
}
export async function loadFamilyVisitDetail(id:string) {
 const {data,error}=await supabase.rpc('get_family_visit_detail',{p_id:id}); if(error)throw error; return data;
}
export async function familyVisitAction(id:string,action:string,note?:string,value?:string) {
 const {error}=await supabase.rpc('family_visit_action',{p_id:id,p_action:action,p_note:note||null,p_value:value||null});if(error)throw error;
}
export async function submitFamilyVisit(destination:string,date:string,family:FamilyMember[],entryOnly:boolean,confirmed:boolean) {
 const {data,error}=await supabase.rpc('submit_family_visit',{p_destination:destination,p_date:date,p_family:family,p_entry_only:entryOnly,p_confirmed:confirmed}); if(error)throw error; return data as string;
}
export const manilaTime = (date?:string) => date ? new Date(date).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}) : 'Not recorded';

export async function downloadFamilyVisitPass(id:string) {
 const detail=await loadFamilyVisitDetail(id); const r=detail.request as FamilyVisit;
 if(!['Approved','Fulfilled'].includes(r.status))throw new Error('Only approved visits have a pass.');
 if(!r.family_visit.destination_id || !r.family_visit.family)throw new Error('Historical visit details are incomplete. HR must review this record before issuing a pass.');
 const {jsPDF}=await import('jspdf'); const pdf=new jsPDF(); let y=24;
 pdf.setFontSize(22);pdf.setTextColor(85,46,160);pdf.text('Family Visit Privilege',18,y);y+=12;
 pdf.setFontSize(10);pdf.setTextColor(35,40,50);
 const line=(text:string)=>{const lines=pdf.splitTextToSize(text,174);for(const l of lines){if(y>270){pdf.addPage();y=20;}pdf.text(l,18,y);y+=6;}y+=3;};
 line(`Reference: ${r.family_visit.reference || r.id}`);
 line(`Employee: ${r.employee_name} | Employee ID: ${r.family_visit.employee_number || 'Not recorded'}`);
 line(`Home BU: ${r.family_visit.home_bu || 'Not recorded'}`);
 line(`Destination: ${r.family_visit.destination_name}`);
 line(`Approved visit date: ${r.date_needed} | Status: ${visitStatus(r).replaceAll('–','-')}`);
 line(`1. ${r.employee_name} - Employee`);
 r.family_visit.family.forEach((f,i)=>line(`${i+2}. ${f.name} - ${f.relationship}`));
 line(`Total approved guests: ${1+r.family_visit.family.length} of 5`);
 line(`Approved: ${manilaTime(r.bod_approved_at)} (Asia/Manila) | Authority: ${detail.approver || 'See approval history'}`);
 line('ENTRY ONLY. Food, games, activities, souvenirs, transportation and other charges are excluded unless separately covered by an approved company policy.');
 line('Guest slots cannot be transferred, combined, carried over or converted to cash. Unused visits expire at calendar year end.');
 line('Verification: Authorized destination operations must open the HRIS record below and verify its current status and guest list. A printed pass does not override a cancellation or revised visit date.');
 const link=`${window.location.origin}/employees/benefits?tab=family_visits&requestId=${r.id}`;
 line(link);pdf.link(18,y-24,174,24,{url:link});
 await familyVisitAction(id,'pdf_generated');pdf.save(`${r.family_visit.reference || r.id}.pdf`);
}

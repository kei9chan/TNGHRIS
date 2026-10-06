import { jsPDF } from 'jspdf';

export interface PreEmploymentChecklistDetails {
  candidateName: string;
  position: string;
  businessUnit: string;
  department: string;
}

// The first page travels with the offer. Page two is the HR handoff section of
// the same checklist, preserving the source form's post-hire tasks.
export const candidateRequirements = [
  'Employee data sheet',
  'CV / résumé (1 photocopy)',
  'Birth certificate (1 photocopy)',
  'Marriage certificate (1 photocopy, if married)',
  'Birth certificates of dependents (1 photocopy each, if applicable)',
  'Diploma (1 photocopy)',
  'Transcript of records (1 photocopy)',
  'Professional examination certificate (if any)',
  'Certificate of employment (if previously employed)',
  'Training certificates (if any)',
  'Professional license (if any)',
  'Medical certificate (original): physical exam, chest X-ray, fecalysis, urinalysis, CBC and drug test',
  'Health certificate (for operations roles)',
  'SSS ID / number',
  'PhilHealth ID / number',
  'HDMF / Pag-IBIG ID / number',
  'TIN / TIN ID',
  'NBI clearance (original)',
  'Police clearance (original)',
  'Cedula (original)',
  'BIR Form 2305 / 2316 (from previous employers, if applicable)',
  'Two 2 × 2 ID photos (white background)',
  'Statement of account / loan balance from SSS or HDMF (if applicable)',
];

export const hrOnboardingSteps = [
  'Employment contract',
  'Company ID',
  'Email account',
  'Biometric enrollment',
  'BDO application form',
  'New hire announcement',
  'Onboarding tour and team introductions',
  'Welcome kit',
];

export const buildPreEmploymentChecklistPdf = (details: PreEmploymentChecklistDetails) => {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const ink: [number, number, number] = [28, 39, 58];
  const muted: [number, number, number] = [89, 103, 122];
  const violet: [number, number, number] = [91, 48, 181];

  const basePage = (section: string, pageNumber: number) => {
    pdf.setFillColor(...violet).rect(0, 0, 210, 13, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ink);
    pdf.text('PRE-EMPLOYMENT CHECKLIST', 16, 27);
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted);
    pdf.text(section, 16, 34);
    pdf.setDrawColor(217, 223, 232).line(16, 278, 194, 278);
    pdf.text('Bring original documents for verification before submitting photocopies.', 16, 284);
    pdf.text(`${pageNumber} / 2`, 194, 284, { align: 'right' });
  };

  basePage('Candidate documents • complete with HR', 1);
  const field = (label: string, value: string, x: number, y: number, width: number) => {
    pdf.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...muted).text(label.toUpperCase(), x, y);
    pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...ink).text(value || '—', x, y + 6, { maxWidth: width });
    pdf.setDrawColor(217, 223, 232).line(x, y + 9, x + width, y + 9);
  };
  field('Employee name', details.candidateName, 16, 46, 83);
  field('Position', details.position, 111, 46, 83);
  field('Business unit', details.businessUnit, 16, 64, 83);
  field('Department', details.department, 111, 64, 83);

  const tableHeader = (y: number) => {
    pdf.setFillColor(241, 237, 250).rect(16, y, 178, 9, 'F');
    pdf.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...violet);
    pdf.text('DOCUMENT / REQUIREMENT', 21, y + 6);
    pdf.text('DATE', 145, y + 6);
    pdf.text('REMARKS', 165, y + 6);
  };
  tableHeader(84);
  let y = 93;
  for (const requirement of candidateRequirements) {
    const lines = pdf.splitTextToSize(requirement, 111) as string[];
    const height = Math.max(7.5, lines.length * 4.3 + 2.2);
    pdf.setDrawColor(225, 230, 237).line(16, y + height, 194, y + height);
    pdf.setDrawColor(...muted).rect(20, y + height / 2 - 1.6, 3.2, 3.2);
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...ink);
    pdf.text(lines, 27, y + 5.1);
    y += height;
  }
  pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted);
  pdf.text('Date and remarks may be completed as each requirement is verified by HR.', 16, Math.min(273, y + 8));

  pdf.addPage();
  basePage('HR onboarding and acknowledgment', 2);
  pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...ink);
  pdf.text('HR completes these steps after the candidate documents are reviewed.', 16, 45);
  tableHeader(54);
  y = 63;
  for (const step of hrOnboardingSteps) {
    pdf.setDrawColor(225, 230, 237).line(16, y + 11, 194, y + 11);
    pdf.setDrawColor(...muted).rect(20, y + 3.5, 3.2, 3.2);
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...ink).text(step, 27, y + 6.7);
    y += 11;
  }
  pdf.setFillColor(247, 248, 251).roundedRect(16, 170, 178, 38, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...ink).text('DOCUMENT VERIFICATION', 22, 179);
  pdf.setFont('helvetica', 'normal').setFontSize(8.5);
  pdf.text('HR will confirm the applicable documents and the next steps for', 22, 187);
  pdf.text('employment contract and payroll processing.', 22, 193);
  pdf.setDrawColor(...muted).line(16, 243, 90, 243).line(112, 243, 194, 243);
  pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted);
  pdf.text('Candidate signature over printed name', 16, 249);
  pdf.text('Date / HR acknowledgment', 112, 249);
  return pdf;
};

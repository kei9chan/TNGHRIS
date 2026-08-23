import { Offer, OfferBuilderDetails } from '../../types';
import { mergeAppearance } from './offerBranding';

const peso = (value = 0) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (value?: Date | string) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
const hex = (value: string) => { const clean = value.replace('#', ''); return [Number.parseInt(clean.slice(0,2),16), Number.parseInt(clean.slice(2,4),16), Number.parseInt(clean.slice(4,6),16)] as [number,number,number]; };

export const downloadOfferPdf = async (offer: Partial<Offer>, details: OfferBuilderDetails, candidateName: string, companyName: string, signed = false, onGenerated?: (base64: string) => Promise<void>, autoDownload = true) => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const theme = mergeAppearance(companyName, details.appearance); const [r,g,b] = hex(theme.primaryColor || '#6D28D9');
  const margin = 17; const width = 176; let y = 24; let page = 1;
  const footer = () => { pdf.setDrawColor(r,g,b); pdf.line(margin, 282, 193, 282); pdf.setFontSize(8); pdf.setTextColor(100); pdf.text(theme.footerContent || companyName, margin, 288); pdf.text(`Page ${page}`, 193, 288, { align: 'right' }); };
  const header = () => { pdf.setFillColor(r,g,b); pdf.rect(0,0,210,17,'F'); pdf.setTextColor(255); pdf.setFontSize(10); pdf.text(`${companyName} · Employment Offer`, margin,11); pdf.setTextColor(20); y=27; };
  const nextPage = () => { footer(); pdf.addPage(); page += 1; header(); };
  const ensure = (need: number) => { if (y + need > 276) nextPage(); };
  const heading = (title: string) => { ensure(13); pdf.setFont('helvetica','bold'); pdf.setFontSize(16); pdf.setTextColor(r,g,b); pdf.text(title,margin,y); y += 9; pdf.setTextColor(25); };
  const line = (label: string, value: string) => { const lines = pdf.splitTextToSize(`${label}: ${value}`, width); ensure(lines.length*5+2); pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.text(lines,margin,y); y += lines.length*5+2; };
  const paragraph = (value: string) => { const lines = pdf.splitTextToSize(value || '—', width); for (const text of lines) { ensure(6); pdf.setFont('helvetica','normal'); pdf.setFontSize(10); pdf.text(text,margin,y); y += 5; } y += 2; };
  const bullets = (items: string[]) => items.forEach(item => paragraph(`• ${item}`));
  header(); pdf.setFont('helvetica','bold'); pdf.setFontSize(28); pdf.setTextColor(r,g,b); pdf.text(theme.offerTitle || 'Employment Offer',margin,y); y += 11; pdf.setFontSize(16); pdf.setTextColor(25); pdf.text(candidateName || 'Candidate',margin,y); y += 8; line('Position',details.jobTitle || '—'); line('Business unit',companyName); line('Start date',date(offer.startDate)); line('Location',details.workLocation || '—'); line('Employment type',offer.employmentType || '—'); y += 3; paragraph(details.welcomeMessage || 'We are excited to welcome you to our team.');
  heading('Your Role'); line('Department',details.department || '—'); line('Reporting to',details.reportingManager || '—'); line('Schedule',`${details.workScheduleDays || '—'} · ${details.workScheduleHours || '—'}`); paragraph(details.rolePurpose || '—');
  heading('Key Responsibilities'); bullets((details.responsibilities || []).filter(item=>item.label).map(item=>item.label));
  heading('What Success Looks Like'); bullets((details.successOutcomes || []).filter(item=>item.label).map(item=>item.label));
  heading('First 90 Days'); (['30','60','90'] as const).forEach(day => { line(`First ${day} Days`,details.milestones?.[day]?.description || 'To be discussed'); if(details.milestones?.[day]?.successCriteria) line('Success criteria',details.milestones[day].successCriteria || ''); });
  heading('What You Earn'); line('Monthly salary',peso(details.grossMonthlySalary || offer.basePay)); line('Annualized salary',`${peso(details.grossAnnualizedSalary)} annualized`); line('Probationary salary',peso(details.probationarySalary)); line('Regularization salary',peso(details.regularizationSalary)); line('Incentive eligibility',details.commissionOrIncentive || 'None specified'); line('Bonus eligibility',details.bonusEligibility || 'Subject to company policy and eligibility'); (details.allowances || []).filter(item=>item.name).forEach(item=>line(item.name,`${peso(item.amount)} · ${item.guaranteed?'Guaranteed':'Estimated'}`));
  heading('What You Receive'); bullets((details.benefits || []).filter(item=>item.included).map(item=>`${item.name}${item.value?` — ${item.value}`:''}${item.eligibility?` (${item.eligibility})`:''}`));
  heading('Where You Can Grow'); bullets((details.growthItems || []).filter(item=>item.included).map(item=>`${item.name} — ${item.description}`));
  heading('Next Steps'); line('Response deadline',date(offer.offerExpirationDate)); paragraph('Use the secure email link to accept and sign, decline, or ask Recruitment a question.'); const response=(details as any).candidateResponse||{}; line('Candidate signature',response.signatureName || offer.signatureName || '____________________'); line('Signature date',date(response.respondedAt || offer.signedAt)); if(signed) paragraph('Offer accepted and signed. This document reflects the securely recorded candidate response.');
  footer(); if (onGenerated) await onGenerated(pdf.output('datauristring').split(',')[1] || ''); if (autoDownload) pdf.save(`${offer.offerNumber || 'employment-offer'}${signed?'-signed':''}.pdf`);
};

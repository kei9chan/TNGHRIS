import { Offer, OfferBuilderDetails } from '../../types';
import { mergeAppearance } from './offerBranding';
import { formatPHP } from './offerCurrency';
import { DEFAULT_ADDITIONAL_OFFER_TERMS, employmentTypeLabel } from './offerEmployment';
import regularFontUrl from '../../assets/fonts/TNGSans.ttf?url';
import boldFontUrl from '../../assets/fonts/TNGSans-Bold.ttf?url';

type RGB = [number, number, number];

const date = (value?: Date | string) => value
  ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  : 'Not specified';

const hex = (value: string, fallback: RGB): RGB => {
  const clean = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return [0, 2, 4].map(index => Number.parseInt(clean.slice(index, index + 2), 16)) as RGB;
};

const tint = ([r, g, b]: RGB, amount = 0.9): RGB => [
  Math.round(r + (255 - r) * amount),
  Math.round(g + (255 - g) * amount),
  Math.round(b + (255 - b) * amount),
];

const money = (value: number | undefined, specified: boolean) => specified ? formatPHP(value, true) : 'Not specified';

const imageData = async (url?: string) => {
  if (!url) return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
};

const fontBase64 = async (url: string) => {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
};

export const buildOfferPdf = async (
  offer: Partial<Offer>,
  details: OfferBuilderDetails,
  candidateName: string,
  companyName: string,
  signed = false,
) => {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const [regularFont, boldFont] = await Promise.all([fontBase64(regularFontUrl), fontBase64(boldFontUrl)]);
  pdf.addFileToVFS('TNGSans.ttf', regularFont);
  pdf.addFont('TNGSans.ttf', 'TNGSans', 'normal');
  pdf.addFileToVFS('TNGSans-Bold.ttf', boldFont);
  pdf.addFont('TNGSans-Bold.ttf', 'TNGSans', 'bold');
  const appearance = mergeAppearance(companyName, details.appearance);
  const employmentLabel = employmentTypeLabel(offer);
  const primary = hex(appearance.primaryColor || '#0EA5A4', [14, 165, 164]);
  const accent = hex(appearance.accentColor || '#FF6B6B', [255, 107, 107]);
  const text = hex(appearance.textColor || '#0F172A', [15, 23, 42]);
  const pageBackground = hex(appearance.pageBackgroundColor || '#FFFFFF', [255, 255, 255]);
  const palePrimary = tint(primary, 0.91);
  const paleAccent = tint(accent, 0.9);
  const margin = 16;
  const contentWidth = 178;
  const bottom = 278;
  let y = 24;
  const logo = await imageData(offer.logoUrl);

  const fillPage = () => {
    pdf.setFillColor(...pageBackground);
    pdf.rect(0, 0, 210, 297, 'F');
  };

  const pageHeader = () => {
    fillPage();
    pdf.setFillColor(...primary);
    pdf.rect(0, 0, 210, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('TNGSans', 'bold');
    pdf.setFontSize(9);
    pdf.text(`${companyName}  ·  Employment Offer`, margin, 10);
    y = 24;
  };

  const newPage = () => {
    pdf.addPage();
    pageHeader();
  };

  const ensure = (height: number) => {
    if (y + height > bottom) newPage();
  };

  const linesFor = (value: string, width = contentWidth) => pdf.splitTextToSize(value || 'Not specified', width) as string[];

  const paragraph = (value: string, options: { color?: RGB; size?: number; width?: number; gap?: number } = {}) => {
    const size = options.size || 10;
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(size);
    const lines = linesFor(value || 'Not specified', options.width || contentWidth);
    const height = lines.length * (size * 0.45) + (options.gap ?? 3);
    ensure(height);
    pdf.setTextColor(...(options.color || text));
    pdf.text(lines, margin, y);
    y += height;
  };

  const heading = (title: string, subtitle?: string) => {
    ensure(subtitle ? 18 : 12);
    pdf.setFont('TNGSans', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...primary);
    pdf.text(title, margin, y);
    y += 7;
    if (subtitle) paragraph(subtitle, { color: [100, 116, 139], size: 8, gap: 4 });
  };

  const labelValue = (label: string, value: string, x = margin, width = 84) => {
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(10);
    const lines = linesFor(value || 'Not specified', width);
    ensure(7 + lines.length * 4);
    pdf.setFont('TNGSans', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(label.toUpperCase(), x, y);
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...text);
    pdf.text(lines, x, y + 5);
    return 6 + lines.length * 4;
  };

  const twoColumnRows = (rows: Array<[string, string]>) => {
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(10);
    for (let index = 0; index < rows.length; index += 2) {
      const left = rows[index];
      const right = rows[index + 1];
      const leftLines = linesFor(left[1], 79).length;
      const rightLines = right ? linesFor(right[1], 79).length : 0;
      const rowHeight = 8 + Math.max(leftLines, rightLines) * 4;
      ensure(rowHeight);
      labelValue(left[0], left[1], margin, 79);
      if (right) labelValue(right[0], right[1], 108, 79);
      y += rowHeight;
    }
  };

  const bullet = (value: string, color: RGB = primary) => {
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(9.5);
    const lines = linesFor(value, contentWidth - 9);
    const height = Math.max(8, lines.length * 4.6 + 3);
    ensure(height);
    pdf.setFillColor(...color);
    pdf.circle(margin + 2, y - 1, 1.4, 'F');
    pdf.setTextColor(...text);
    pdf.text(lines, margin + 7, y);
    y += height;
  };

  const card = (x: number, width: number, title: string, value: string, caption: string, fill: RGB) => {
    pdf.setFillColor(...fill);
    pdf.roundedRect(x, y, width, 31, 3, 3, 'F');
    pdf.setFont('TNGSans', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...primary);
    pdf.text(title.toUpperCase(), x + 5, y + 7);
    pdf.setFontSize(15);
    pdf.setTextColor(...text);
    pdf.text(linesFor(value, width - 10), x + 5, y + 16);
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(caption, x + 5, y + 26);
  };

  // Page 1 — branded, concise overview.
  fillPage();
  pdf.setFillColor(...primary);
  pdf.rect(0, 0, 210, 76, 'F');
  pdf.setFillColor(...accent);
  pdf.circle(190, 5, 29, 'F');
  pdf.setFillColor(...tint(primary, 0.25));
  pdf.circle(178, 68, 22, 'F');
  if (logo) {
    try { pdf.addImage(logo, 'PNG', margin, 11, 20, 20, undefined, 'FAST'); } catch { /* keep text fallback */ }
  }
  pdf.setFont('TNGSans', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(25);
  pdf.text(linesFor(appearance.offerTitle || 'Your Total Opportunity', 112), margin, 40);
  pdf.setFontSize(13);
  pdf.setTextColor(...paleAccent);
  pdf.text(details.jobTitle || 'Employment Offer', margin, 65);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(132, 22, 61, 42, 4, 4, 'F');
  pdf.setFontSize(14);
  pdf.setTextColor(...text);
  pdf.text(linesFor(candidateName || 'Candidate', 51), 137, 32);
  pdf.setFont('TNGSans', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Start: ${date(offer.startDate)}`, 137, 49);
  pdf.text(linesFor(`Type: ${employmentLabel}`, 51), 137, 56);

  y = 88;
  paragraph(details.welcomeMessage || `We're excited to welcome you to ${companyName}. Here is a clear look at your role, compensation, benefits, and growth opportunity.`, { size: 11, gap: 8 });
  const monthlySpecified = details.grossMonthlySalary !== undefined || offer.basePay !== undefined;
  const annualSpecified = details.grossAnnualizedSalary !== undefined || monthlySpecified;
  const monthly = details.grossMonthlySalary ?? offer.basePay;
  const annual = details.grossAnnualizedSalary ?? (monthly !== undefined ? monthly * 12 : undefined);
  card(margin, 55, 'What you earn', money(monthly, monthlySpecified), 'gross monthly salary', palePrimary);
  card(77.5, 55, 'Annualized', money(annual, annualSpecified), 'annualized salary', tint(accent, 0.93));
  card(139, 55, 'Work location', details.workLocation || 'Not specified', employmentLabel, [246, 248, 252]);
  y += 41;
  heading('Your Role');
  twoColumnRows([
    ['Job title', details.jobTitle || 'Not specified'],
    ['Department', details.department || 'Not specified'],
    ['Reporting to', details.reportingManager || 'Not specified'],
    ['Business unit', companyName],
    ['Work schedule', [details.workScheduleDays, details.workScheduleHours].filter(Boolean).join(' · ') || 'Not specified'],
    ['Start date', date(offer.startDate)],
    ['Employment type', employmentLabel],
    ['Employment end date', date(offer.employmentEndDate)],
  ]);
  heading('Role Purpose');
  paragraph(details.rolePurpose || offer.jobDescription || 'Role purpose to be discussed with the hiring team.');

  // Page 2 — role expectations.
  newPage();
  heading('Key Responsibilities', 'What the employee will own and deliver.');
  const responsibilities = (details.responsibilities || []).map(item => item.label).filter(Boolean);
  (responsibilities.length ? responsibilities : ['Responsibilities will be discussed with the hiring manager.']).forEach(item => bullet(item));
  y += 3;
  heading('What Success Looks Like', 'Clear outcomes for strong performance in the role.');
  const outcomes = (details.successOutcomes || []).map(item => item.label).filter(Boolean);
  (outcomes.length ? outcomes : ['Success outcomes will be agreed during onboarding.']).forEach(item => bullet(item, accent));
  y += 4;
  heading('Your First 90 Days');
  const milestones = ['30', '60', '90'] as const;
  for (const day of milestones) {
    const milestone = details.milestones?.[day];
    ensure(25);
    pdf.setFillColor(...palePrimary);
    pdf.roundedRect(margin, y - 4, contentWidth, milestone?.successCriteria ? 22 : 17, 3, 3, 'F');
    pdf.setFont('TNGSans', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...primary);
    pdf.text(`First ${day} Days`, margin + 5, y + 2);
    pdf.setFont('TNGSans', 'normal');
    pdf.setTextColor(...text);
    pdf.text(linesFor(milestone?.description || 'Milestones will be agreed with your manager.', 130), margin + 40, y + 2);
    if (milestone?.successCriteria) {
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Success criteria: ${milestone.successCriteria}`, margin + 40, y + 11);
    }
    y += milestone?.successCriteria ? 27 : 22;
  }

  // Page 3+ — compensation, benefits and growth flow naturally across pages.
  newPage();
  heading('What You Earn', 'Guaranteed and performance-based compensation are clearly separated.');
  twoColumnRows([
    ['Monthly salary', money(monthly, monthlySpecified)],
    ['Annualized salary', money(annual, annualSpecified)],
    ['Probationary salary', money(details.probationarySalary, details.probationarySalary !== undefined)],
    ['Regularization salary', money(details.regularizationSalary, details.regularizationSalary !== undefined)],
    ['Pay frequency', details.payFrequency || 'Not specified'],
    ['Payroll schedule', details.payrollSchedule || 'Not specified'],
    ['Incentive eligibility', details.commissionOrIncentive || 'Not specified'],
    ['Bonus eligibility', details.bonusEligibility || 'Subject to company policy and eligibility'],
  ]);
  const allowances = (details.allowances || []).filter(item => item.name);
  if (allowances.length) {
    pdf.setFont('TNGSans', 'bold'); pdf.setFontSize(11); pdf.setTextColor(...text); pdf.text('Allowances', margin, y); y += 7;
    allowances.forEach(item => bullet(`${item.name}: ${money(item.amount, item.amount !== undefined)} · ${item.guaranteed ? 'Guaranteed' : 'Estimated'}`));
  }
  paragraph('Bonuses, incentives, and estimated compensation depend on company policy, eligibility, and/or performance unless expressly stated otherwise.', { color: [100, 116, 139], size: 8, gap: 7 });
  heading('What You Receive');
  const benefits = (details.benefits || []).filter(item => item.included);
  (benefits.length ? benefits.map(item => `${item.name}${item.value ? ` — ${item.value}` : ''}${item.eligibility ? ` · ${item.eligibility}` : ''}`) : ['Benefits will be confirmed by Recruitment.']).forEach(item => bullet(item, accent));
  y += 3;
  heading('Where You Can Grow');
  const growth = (details.growthItems || []).filter(item => item.included);
  (growth.length ? growth.map(item => `${item.name}${item.description ? ` — ${item.description}` : ''}`) : ['Growth and development opportunities will be discussed with your manager.']).forEach(item => bullet(item));

  y += 4;
  heading('Additional Terms & Conditions', 'These terms apply to this offer only.');
  const additionalTerms = details.additionalTerms ?? DEFAULT_ADDITIONAL_OFFER_TERMS;
  const termParagraphs = additionalTerms.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  (termParagraphs.length ? termParagraphs : ['—']).forEach(value => paragraph(value, { size: 9, gap: 6 }));

  newPage();
  heading('Next Steps');
  pdf.setFillColor(...palePrimary);
  pdf.roundedRect(margin, y - 4, contentWidth, 35, 4, 4, 'F');
  pdf.setFont('TNGSans', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...text);
  pdf.text(`Please respond by ${date(offer.offerExpirationDate)}.`, margin + 6, y + 5);
  pdf.setFont('TNGSans', 'normal');
  pdf.setFontSize(9);
  pdf.text(linesFor('Use the secure offer link from your email to accept and sign, decline, or ask Recruitment a question.', contentWidth - 12), margin + 6, y + 14);
  y += 43;
  heading(signed ? 'Signed Acceptance' : 'Acceptance & Signature');
  const response = (details as OfferBuilderDetails & { candidateResponse?: { signatureName?: string; respondedAt?: string } }).candidateResponse;
  twoColumnRows([
    ['Candidate name', response?.signatureName || offer.signatureName || candidateName || '____________________'],
    ['Signature date', date(response?.respondedAt || offer.signedAt)],
    ['Offer status', signed ? 'Accepted and signed' : (offer.status || 'Pending response')],
    ['Offer number', offer.offerNumber || 'Not specified'],
  ]);
  if (signed) paragraph('This document reflects the candidate acceptance and electronic signature securely recorded by TNG HRIS.', { color: [22, 101, 52], size: 9 });
  heading('Questions?');
  paragraph(`Please contact ${companyName} Recruitment using the Ask a Question action in your secure offer link.`);

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...tint(primary, 0.7));
    pdf.line(margin, 284, 194, 284);
    pdf.setFont('TNGSans', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(appearance.footerContent || `${companyName} · Confidential employment offer`, margin, 290);
    pdf.text(`Page ${page} of ${totalPages}`, 194, 290, { align: 'right' });
  }
  return pdf;
};

export const downloadOfferPdf = async (
  offer: Partial<Offer>,
  details: OfferBuilderDetails,
  candidateName: string,
  companyName: string,
  signed = false,
  onGenerated?: (base64: string) => Promise<void>,
  autoDownload = true,
) => {
  const pdf = await buildOfferPdf(offer, details, candidateName, companyName, signed);
  if (onGenerated) await onGenerated(pdf.output('datauristring').split(',')[1] || '');
  if (autoDownload) pdf.save(`${offer.offerNumber || 'employment-offer'}${signed ? '-signed' : ''}.pdf`);
  return pdf;
};

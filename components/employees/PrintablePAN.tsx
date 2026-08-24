import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PAN, PANOrientation, PANPaperSize, PANRole, PANStepStatus, PANTemplate } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { useUsers } from '../../hooks/useHRData';
import Button from '../ui/Button';
import { DEFAULT_PAN_SECTIONS, shouldShowSalary } from '../../services/panTemplateUtils';

interface PrintablePANProps {
  pan: PAN;
  template?: PANTemplate;
  onClose: () => void;
}

const money = (value?: number) => `PHP ${(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value?: Date | string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not Applicable';
const text = (value?: string) => value?.trim() || 'Not Applicable';
const displayToValue = (from?: string, to?: string) => !to?.trim() || to.trim() === from?.trim() ? 'Same' : to.trim();

const waitForImages = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'));
  await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => resolve(), { once: true });
  })));
};

const PrintablePAN: React.FC<PrintablePANProps> = ({ pan, template, onClose }) => {
  const { settings } = useSettings();
  const { users } = useUsers();
  const employee = users.find(user => user.id === pan.employeeId);
  const sheetRef = useRef<HTMLDivElement>(null);
  const snapshot = pan.templateSnapshot;
  const [paperSize, setPaperSize] = useState<PANPaperSize>(snapshot?.paperSize || template?.paperSize || 'A4');
  const [orientation, setOrientation] = useState<PANOrientation>(snapshot?.orientation || template?.orientation || 'portrait');
  const [blackAndWhite, setBlackAndWhite] = useState(false);
  const [copies, setCopies] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState('');

  const from = pan.particulars?.from || {};
  const to = pan.particulars?.to || {};
  const fromSalary = from.salary || {};
  const toSalary = to.salary || {};
  const fromTotal = (fromSalary.basic || 0) + (fromSalary.deminimis || 0) + (fromSalary.reimbursable || 0);
  const toTotal = (toSalary.basic || 0) + (toSalary.deminimis || 0) + (toSalary.reimbursable || 0);
  const accent = snapshot?.colorAccent || template?.colorAccent || '#172554';
  const documentTitle = snapshot?.documentTitle || template?.documentTitle || 'PERSONNEL ACTION NOTICE';
  const documentCode = snapshot?.documentCode || template?.documentCode || 'TNG-HRD-022';
  const footerText = snapshot?.footerText || template?.footerText || settings.pdfFooter || '';
  const logo = snapshot?.logoUrl || pan.logoUrl || template?.logoUrl || settings.appLogoUrl;
  const sections = snapshot?.sections || template?.sections || DEFAULT_PAN_SECTIONS;
  const fields = snapshot?.fieldConfig || template?.fieldConfig || [];
  const sectionVisible = (key: string) => sections.find(section => section.key === key)?.visible !== false;
  const fieldVisible = (key: string) => fields.find(field => field.key === key)?.visible !== false;
  const fieldLabel = (key: string, fallback: string) => fields.find(field => field.key === key)?.label || fallback;
  const displaySalary = sectionVisible('salary_package') && fieldVisible('salary') && shouldShowSalary(pan, snapshot || template);

  const approvers = useMemo(() => [...(pan.routingSteps || [])]
    .filter(step => step.role !== PANRole.Acknowledger)
    .sort((a, b) => a.order - b.order)
    .map(step => {
      const approver = users.find(user => user.id === step.userId);
      return { ...step, position: approver?.position || step.role, signatureUrl: approver?.signatureUrl };
    }), [pan.routingSteps, users]);

  const actionItems = [
    pan.actionTaken?.changeOfStatus && 'Change of Employment Status', pan.actionTaken?.promotion && 'Promotion',
    pan.actionTaken?.transfer && 'Transfer', pan.actionTaken?.changeOfJobTitle && 'Change of Job Title',
    pan.actionTaken?.salaryIncrease && 'Salary Increase', pan.actionTaken?.others && `Others: ${pan.actionTaken.others}`,
  ].filter(Boolean) as string[];

  useEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    const updatePages = () => {
      const usableHeight = paperSize === 'A4' ? 1050 : 1000;
      setPageCount(Math.max(1, Math.ceil(element.scrollHeight / usableHeight)));
    };
    const timer = window.setTimeout(updatePages, 100);
    return () => window.clearTimeout(timer);
  }, [paperSize, orientation, pan, displaySalary]);

  const handlePrint = async () => {
    if (!sheetRef.current) return;
    setError(''); setIsPreparing(true);
    try {
      await waitForImages(sheetRef.current);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
    } catch (printError) {
      console.error('Failed to prepare PAN print view', printError);
      setError('The print view could not be prepared. Please try again.');
    } finally { setIsPreparing(false); }
  };

  const handleDownloadPdf = async () => {
    if (!sheetRef.current) return;
    setError(''); setIsPreparing(true);
    try {
      await waitForImages(sheetRef.current);
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(sheetRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const pdf = new jsPDF({ orientation, unit: 'mm', format: paperSize === 'A4' ? 'a4' : 'letter', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth;
      const imageHeight = canvas.height * imageWidth / canvas.width;
      const imageData = canvas.toDataURL('image/jpeg', 0.94);
      let heightLeft = imageHeight;
      let position = 0;
      pdf.addImage(imageData, 'JPEG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
      while (heightLeft > 1) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'JPEG', 0, position, imageWidth, imageHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }
      pdf.save(`PAN-${pan.id.slice(0, 8).toUpperCase()}-${pan.employeeName.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`);
    } catch (pdfError) {
      console.error('Failed to generate PAN PDF', pdfError);
      setError('The PDF could not be generated. You can still use Print and choose “Save as PDF”.');
    } finally { setIsPreparing(false); }
  };

  if (typeof document === 'undefined') return null;
  const isLandscape = orientation === 'landscape';
  const sheetClass = paperSize === 'A4'
    ? (isLandscape ? 'pan-paper-a4-landscape' : 'pan-paper-a4-portrait')
    : (isLandscape ? 'pan-paper-letter-landscape' : 'pan-paper-letter-portrait');
  const detailRows = [
    fieldVisible('employment_status') && [fieldLabel('employment_status', 'Employment Status'), text(from.employmentStatus), displayToValue(from.employmentStatus, to.employmentStatus)],
    fieldVisible('department') && [fieldLabel('department', 'Department'), text(from.department), displayToValue(from.department, to.department)],
    fieldVisible('position') && [fieldLabel('position', 'Position'), text(from.position), displayToValue(from.position, to.position)],
    fieldVisible('business_unit') && [fieldLabel('business_unit', 'Business Unit / Company'), text(from.businessUnit), displayToValue(from.businessUnit, to.businessUnit)],
    fieldVisible('other_business_units') && [fieldLabel('other_business_units', 'Other Business Unit(s) / Affiliates'), text(from.otherBusinessUnits?.join(', ')), displayToValue(from.otherBusinessUnits?.join(', '), to.otherBusinessUnits?.join(', '))],
  ].filter(Boolean) as string[][];

  return createPortal(<div id="pan-print-portal-root" className={`pan-preview-root ${blackAndWhite ? 'pan-bw' : ''}`}>
    <style>{`
      .pan-preview-root { position: fixed; inset: 0; z-index: 10000; display: grid; grid-template-columns: minmax(0,1fr) 340px; background: #e5e7eb; color: #111827; }
      .pan-preview-stage { overflow: auto; padding: 20px; }
      .pan-print-sheet { box-sizing: border-box; margin: 0 auto; padding: 12mm 14mm 10mm; background: #fff; font-family: Georgia, 'Times New Roman', serif; box-shadow: 0 12px 36px rgba(15,23,42,.2); }
      .pan-paper-a4-portrait { width: 210mm; min-height: 297mm; } .pan-paper-a4-landscape { width: 297mm; min-height: 210mm; }
      .pan-paper-letter-portrait { width: 216mm; min-height: 279mm; } .pan-paper-letter-landscape { width: 279mm; min-height: 216mm; }
      .pan-print-sheet table { width: 100%; border-collapse: collapse; } .pan-print-sheet th, .pan-print-sheet td { border: 1px solid #4b5563; padding: 5px 7px; vertical-align: top; }
      .pan-title { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: .02em; text-align: center; padding: 6px; }
      .pan-label { font-weight: 700; } .pan-section { margin-top: 13px; break-inside: avoid; }
      .pan-section-title { border: 1px solid #4b5563; background: #f3f4f6; font-weight: 700; padding: 5px 7px; text-transform: uppercase; }
      .pan-action-grid { display: grid; grid-template-columns: repeat(3, 1fr); } .pan-action { border: 1px solid #4b5563; border-top: 0; padding: 5px 7px; min-height: 25px; }
      .pan-note { min-height: 48px; white-space: pre-wrap; } .pan-signatures { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 28px; break-inside: avoid; }
      .pan-signature { min-height: 96px; text-align: center; font-size: 10px; display: flex; flex-direction: column; justify-content: flex-end; }
      .pan-signature img { display: block; max-width: 100%; max-height: 48px; margin: 0 auto 3px; object-fit: contain; }
      .pan-signature-name { border-top: 1px solid #111; padding-top: 3px; font-weight: 700; text-transform: uppercase; }
      .pan-footer { color: #6b7280; font-size: 9px; text-align: right; margin-top: 10px; } .pan-bw .pan-print-sheet { filter: grayscale(1); }
      .pan-preview-controls { overflow-y: auto; border-left: 1px solid #d1d5db; background: #fff; padding: 22px; font-family: ui-sans-serif, system-ui, sans-serif; }
      @media (max-width: 900px) { .pan-preview-root { grid-template-columns: 1fr; grid-template-rows: minmax(0,1fr) auto; } .pan-preview-controls { max-height: 44vh; border-left: 0; border-top: 1px solid #d1d5db; } .pan-preview-stage { padding: 12px; } }
      @media print {
        @page { size: ${paperSize} ${orientation}; margin: 0; }
        html, body { background: #fff !important; }
        body > *:not(#pan-print-portal-root) { display: none !important; }
        #pan-print-portal-root { position: static !important; display: block !important; background: #fff !important; }
        .pan-preview-stage { overflow: visible !important; padding: 0 !important; }
        .pan-preview-controls { display: none !important; }
        .pan-print-sheet { width: auto !important; min-height: auto !important; margin: 0 !important; padding: 11mm 12mm !important; box-shadow: none !important; filter: ${blackAndWhite ? 'grayscale(1)' : 'none'} !important; }
        .pan-print-sheet thead { display: table-header-group; } .pan-print-sheet tr, .pan-signatures { break-inside: avoid; }
      }
    `}</style>
    <div className="pan-preview-stage">
      <article ref={sheetRef} className={`pan-print-sheet ${sheetClass}`} style={{ '--pan-accent': accent } as React.CSSProperties}>
        <header style={{ textAlign: 'center', marginBottom: 12 }}>{logo && <img crossOrigin="anonymous" src={logo} alt="Company logo" style={{ maxHeight: 58, maxWidth: 170, objectFit: 'contain', margin: '0 auto 4px' }} />}<div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '.08em' }}>{settings.appName || 'THE NEXT EXPERIENCE GROUP'}</div></header>
        <div className="pan-title" style={{ background: accent }}>{documentTitle}</div>
        {sectionVisible('employee_information') && <table><tbody><tr><td className="pan-label" style={{ width: '18%' }}>{fieldLabel('employee_name', 'Employee’s Name')}</td><td style={{ width: '37%' }}>{pan.employeeName}</td><td className="pan-label" style={{ width: '18%' }}>{fieldLabel('date_hired', 'Date Hired')}</td><td>{fieldVisible('date_hired') ? date(employee?.dateHired) : 'Not Applicable'}</td></tr><tr><td className="pan-label">BU / Department</td><td>{text(from.businessUnit)}<br /><span style={{ fontSize: 10 }}>{text(from.department)}</span></td><td className="pan-label">Effectivity Date</td><td>{date(pan.effectiveDate)}</td></tr><tr><td className="pan-label">Position</td><td>{text(from.position)}</td><td className="pan-label">PAN Reference</td><td>PAN-{pan.id.slice(0, 8).toUpperCase()}</td></tr></tbody></table>}
        {sectionVisible('action_taken') && <div className="pan-section"><div className="pan-section-title">Action Taken</div><div className="pan-action-grid">{['Change of Employment Status', 'Transfer', 'Change of Job Title', 'Promotion', 'Salary Increase', 'Others'].map(label => <div key={label} className="pan-action">{actionItems.some(item => item.toLowerCase().startsWith(label.toLowerCase())) ? '☒' : '☐'} &nbsp;{label}{label === 'Others' && pan.actionTaken?.others ? `: ${pan.actionTaken.others}` : ''}</div>)}</div></div>}
        {sectionVisible('from_to') && <><p style={{ margin: '15px 0 8px', fontSize: 13 }}>You are hereby notified of the following actions affecting your employment with the Company:</p><div className="pan-section"><table><thead><tr><th style={{ width: '28%', background: accent, color: '#fff' }}>PARTICULARS</th><th style={{ width: '36%', background: accent, color: '#fff' }}>FROM</th><th style={{ background: accent, color: '#fff' }}>TO</th></tr></thead><tbody>{detailRows.map(([label, fromValue, toValueText]) => <tr key={label}><td className="pan-label">{label}</td><td>{fromValue}</td><td>{toValueText}</td></tr>)}{displaySalary && <tr><td className="pan-label">Salary / Compensation</td><td><b>Total Package: {money(fromTotal)} / month gross</b><br />Basic: {money(fromSalary.basic)}<br />De minimis Benefit: {money(fromSalary.deminimis)}<br />Reimbursable: {money(fromSalary.reimbursable)}</td><td><b>Total Package: {money(toTotal)} / month gross</b><br />Basic: {money(toSalary.basic)}<br />De minimis Benefit: {money(toSalary.deminimis)}<br />Reimbursable: {money(toSalary.reimbursable)}</td></tr>}</tbody></table></div></>}
        {sectionVisible('remarks') && fieldVisible('remarks') && <div className="pan-section"><div className="pan-section-title">{fieldLabel('remarks', 'Remarks / Justifications')}</div><div className="pan-note" style={{ border: '1px solid #4b5563', borderTop: 0, padding: 7 }}>{pan.notes || 'Not Applicable'}</div></div>}
        {sectionVisible('approval_signatures') && <div className="pan-signatures"><div className="pan-signature">{(snapshot?.preparerSignatureUrl || pan.preparerSignatureUrl || template?.preparerSignatureUrl) && <img crossOrigin="anonymous" src={snapshot?.preparerSignatureUrl || pan.preparerSignatureUrl || template?.preparerSignatureUrl} alt="Preparer signature" />}<div className="pan-signature-name">{snapshot?.preparerName || pan.preparerName || template?.preparerName || ' '}</div><div>HR Representative</div><b>PREPARED BY</b></div>{approvers.map(step => <div className="pan-signature" key={step.id}>{step.status === PANStepStatus.Approved && step.signatureUrl && <img crossOrigin="anonymous" src={step.signatureUrl} alt={`${step.name} signature`} />}<div className="pan-signature-name">{step.name}</div><div>{step.position}</div><b>{step.role}</b></div>)}{sectionVisible('employee_acknowledgement') && <div className="pan-signature">{pan.signatureDataUrl && <img src={pan.signatureDataUrl} alt="Employee signature" />}<div className="pan-signature-name">{pan.signatureName || ' '}</div><div>Employee’s Name</div><b>RECEIVED BY</b></div>}</div>}
        <footer className="pan-footer">{footerText && <span>{footerText} · </span>}{documentCode} · PAN-{pan.id.slice(0, 8).toUpperCase()} · {pan.status}</footer>
      </article>
    </div>
    <aside className="pan-preview-controls">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">Print preview</h2><p className="mt-1 text-sm text-slate-500">{pageCount} {pageCount === 1 ? 'page' : 'pages'} · PAN-{pan.id.slice(0, 8).toUpperCase()}</p></div><button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button></div>
      <div className="mt-6 space-y-5"><div><label className="text-sm font-medium text-slate-700">Paper size</label><select value={paperSize} onChange={event => setPaperSize(event.target.value as PANPaperSize)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="A4">A4 (210 × 297 mm)</option><option value="Letter">Letter (8.5 × 11 in)</option></select></div><div><label className="text-sm font-medium text-slate-700">Orientation</label><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setOrientation('portrait')} className={`rounded-lg border px-3 py-2 text-sm ${orientation === 'portrait' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300'}`}>Portrait</button><button type="button" onClick={() => setOrientation('landscape')} className={`rounded-lg border px-3 py-2 text-sm ${orientation === 'landscape' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300'}`}>Landscape</button></div></div><InputLike label="Copies" type="number" min={1} max={99} value={copies} onChange={value => setCopies(Math.max(1, Number(value) || 1))} /><div><label className="text-sm font-medium text-slate-700">Color</label><select value={blackAndWhite ? 'bw' : 'color'} onChange={event => setBlackAndWhite(event.target.value === 'bw')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="color">Color</option><option value="bw">Black and white</option></select></div></div>
      {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-8 grid gap-2"><Button onClick={handleDownloadPdf} isLoading={isPreparing}>Download PDF</Button><Button variant="secondary" onClick={handlePrint} isLoading={isPreparing}>Print</Button><Button variant="secondary" onClick={onClose}>Back to PAN</Button></div>
      <p className="mt-4 text-xs text-slate-500">The system prepares the full PAN before opening the browser print dialog. Printer destination and final copy count remain controlled by your browser.</p>
    </aside>
  </div>, document.body);
};

const InputLike = ({ label, value, onChange, ...props }: { label: string; value: number; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => <div><label className="text-sm font-medium text-slate-700">{label}</label><input {...props} value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></div>;

export default PrintablePAN;

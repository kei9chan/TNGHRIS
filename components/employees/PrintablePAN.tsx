import React, { useEffect, useMemo, useRef } from 'react';
import { PAN, PANRole, PANStepStatus } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { useUsers } from '../../hooks/useHRData';

interface PrintablePANProps {
  pan: PAN;
  onClose: () => void;
  onRendered?: (element: HTMLElement, pan: PAN) => void;
  isVisible?: boolean;
}

const money = (value: number | undefined, currency: string) => `${currency} ${(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value?: Date | string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not Applicable';
const text = (value?: string) => value?.trim() || 'Not Applicable';
const toValue = (from?: string, to?: string) => !to?.trim() || to.trim() === from?.trim() ? 'Same' : to.trim();

const PrintablePAN: React.FC<PrintablePANProps> = ({ pan, onClose, onRendered, isVisible = true }) => {
  const { settings } = useSettings();
  const { users } = useUsers();
  const employee = users.find(user => user.id === pan.employeeId);
  const sheetRef = useRef<HTMLDivElement>(null);
  const from = pan.particulars?.from || {};
  const to = pan.particulars?.to || {};
  const fromSalary = from.salary || {};
  const toSalary = to.salary || {};
  const fromTotal = (fromSalary.basic || 0) + (fromSalary.deminimis || 0) + (fromSalary.reimbursable || 0);
  const toTotal = (toSalary.basic || 0) + (toSalary.deminimis || 0) + (toSalary.reimbursable || 0);
  const approvers = useMemo(() => [...(pan.routingSteps || [])].filter(step => step.role !== PANRole.Acknowledger).sort((a, b) => a.order - b.order).map(step => {
    const approver = users.find(user => user.id === step.userId);
    return { ...step, position: approver?.position || step.role, signatureUrl: approver?.signatureUrl };
  }), [pan.routingSteps, users]);
  const actionItems = [
    pan.actionTaken?.changeOfStatus && 'Change of Employment Status',
    pan.actionTaken?.promotion && 'Promotion',
    pan.actionTaken?.transfer && 'Transfer',
    pan.actionTaken?.changeOfJobTitle && 'Change of Job Title',
    pan.actionTaken?.salaryIncrease && 'Salary Increase',
    pan.actionTaken?.others && `Others: ${pan.actionTaken.others}`,
  ].filter(Boolean) as string[];
  const logo = pan.logoUrl || settings.appLogoUrl;

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    const ready = async () => {
      const images = Array.from(sheetRef.current?.querySelectorAll('img') || []);
      await Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      })));
      if (cancelled || !sheetRef.current) return;
      if (onRendered) { onRendered(sheetRef.current, pan); return; }
      const timer = window.setTimeout(() => window.print(), 80);
      return () => window.clearTimeout(timer);
    };
    ready();
    const afterPrint = () => onClose();
    window.addEventListener('afterprint', afterPrint);
    return () => { cancelled = true; window.removeEventListener('afterprint', afterPrint); };
  }, [isVisible, onClose, onRendered, pan]);

  const detailRows = [
    ['Employment Status', text(from.employmentStatus), toValue(from.employmentStatus, to.employmentStatus)],
    ['Department', text(from.department), toValue(from.department, to.department)],
    ['Position', text(from.position), toValue(from.position, to.position)],
    ['Business Unit / Company', text(from.businessUnit), toValue(from.businessUnit, to.businessUnit)],
  ];

  return <div className={`pan-print-root ${!isVisible ? 'pan-print-hidden' : ''}`}>
    <style>{`
      .pan-print-root { font-family: Georgia, 'Times New Roman', serif; color: #111827; }
      .pan-print-root .pan-print-sheet { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 14mm 10mm; background: #fff; }
      .pan-print-root table { width: 100%; border-collapse: collapse; }
      .pan-print-root th, .pan-print-root td { border: 1px solid #4b5563; padding: 5px 7px; vertical-align: top; }
      .pan-print-root .pan-title { background: #111; color: #fff; font-size: 18px; font-weight: 700; letter-spacing: .02em; text-align: center; padding: 6px; }
      .pan-print-root .pan-label { font-weight: 700; white-space: nowrap; }
      .pan-print-root .pan-section { margin-top: 14px; }
      .pan-print-root .pan-section-title { border: 1px solid #4b5563; background: #f3f4f6; font-weight: 700; padding: 5px 7px; text-transform: uppercase; }
      .pan-print-root .pan-action-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
      .pan-print-root .pan-action { border: 1px solid #4b5563; border-top: 0; padding: 5px 7px; min-height: 25px; }
      .pan-print-root .pan-note { min-height: 48px; white-space: pre-wrap; }
      .pan-print-root .pan-signatures { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 30px; }
      .pan-print-root .pan-signature { min-height: 96px; text-align: center; font-size: 10px; display: flex; flex-direction: column; justify-content: flex-end; }
      .pan-print-root .pan-signature img { display: block; max-width: 100%; max-height: 48px; margin: 0 auto 3px; object-fit: contain; }
      .pan-print-root .pan-signature-name { border-top: 1px solid #111; padding-top: 3px; font-weight: 700; text-transform: uppercase; }
      .pan-print-root .pan-footer { color: #6b7280; font-size: 9px; text-align: right; margin-top: 10px; }
      .pan-print-hidden { display: none !important; }
      @media screen {
        .pan-print-root:not(.pan-print-hidden) { position: fixed; inset: 0; z-index: 2000; overflow: auto; background: rgba(15, 23, 42, .72); padding: 20px; }
        .pan-print-root:not(.pan-print-hidden) .pan-print-sheet { box-shadow: 0 12px 40px rgba(0,0,0,.3); }
      }
      @media print {
        @page { size: A4 portrait; margin: 11mm 12mm; }
        html, body { background: #fff !important; }
        body > *:not(.pan-print-root) { display: none !important; }
        .pan-print-root { display: block !important; position: static !important; inset: auto !important; padding: 0 !important; background: #fff !important; }
        .pan-print-root .pan-print-sheet { width: auto !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
        .pan-print-root .pan-section, .pan-print-root .pan-signatures { break-inside: avoid; }
      }
    `}</style>
    <div ref={sheetRef} className="pan-print-sheet">
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        {logo && <img src={logo} alt="Company logo" style={{ maxHeight: 58, maxWidth: 150, objectFit: 'contain', margin: '0 auto 4px' }} />}
        <div style={{ fontSize: 10, color: '#6b7280', letterSpacing: '.08em' }}>{settings.appName || 'THE NEXT EXPERIENCE GROUP'}</div>
      </div>
      <div className="pan-title">PERSONNEL ACTION NOTICE</div>
      <table>
        <tbody>
          <tr><td className="pan-label" style={{ width: '17%' }}>Employee’s Name</td><td style={{ width: '38%' }}>{pan.employeeName}</td><td className="pan-label" style={{ width: '17%' }}>Date Hired</td><td>{date(employee?.dateHired)}</td></tr>
          <tr><td className="pan-label">BU / Department</td><td>{text(from.businessUnit)}<br /><span style={{ fontSize: 10 }}>{text(from.department)}</span></td><td className="pan-label">Effectivity Date</td><td>{date(pan.effectiveDate)}</td></tr>
          <tr><td className="pan-label">Position</td><td colSpan={3}>{text(from.position)}</td></tr>
        </tbody>
      </table>

      <div className="pan-section">
        <div className="pan-section-title">Action Taken</div>
        <div className="pan-action-grid">{['Change of Employment Status', 'Transfer', 'Change of Job Title', 'Promotion', 'Salary Increase', 'Others'].map(label => <div key={label} className="pan-action">{actionItems.some(item => item.toLowerCase().startsWith(label.toLowerCase())) ? '☒' : '☐'} &nbsp;{label}{label === 'Others' && pan.actionTaken?.others ? `: ${pan.actionTaken.others}` : ''}</div>)}</div>
      </div>

      <p style={{ margin: '15px 0 8px', fontSize: 13 }}>You are hereby notified of the following actions affecting your employment with the Company:</p>
      <div className="pan-section">
        <table>
          <thead><tr><th style={{ width: '28%' }}>PARTICULARS</th><th style={{ width: '36%' }}>FROM</th><th>TO</th></tr></thead>
          <tbody>{detailRows.map(([label, fromValue, toValueText]) => <tr key={label}><td className="pan-label">{label}</td><td>{fromValue}</td><td>{toValueText}</td></tr>)}
            <tr><td className="pan-label">Salary / Compensation</td><td><b>Total Package: {money(fromTotal, settings.currency)}</b><br />Basic: {money(fromSalary.basic, settings.currency)}<br />De minimis: {money(fromSalary.deminimis, settings.currency)}<br />Reimbursable: {money(fromSalary.reimbursable, settings.currency)}</td><td><b>Total Package: {money(toTotal, settings.currency)}</b><br />Basic: {money(toSalary.basic, settings.currency)}<br />De minimis: {money(toSalary.deminimis, settings.currency)}<br />Reimbursable: {money(toSalary.reimbursable, settings.currency)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="pan-section"><div className="pan-section-title">Remarks / Justifications</div><div className="pan-note" style={{ border: '1px solid #4b5563', borderTop: 0, padding: '7px' }}>{pan.notes || ''}</div></div>

      <div className="pan-signatures">
        <div className="pan-signature">{pan.preparerSignatureUrl && <img src={pan.preparerSignatureUrl} alt="Preparer signature" />}<div className="pan-signature-name">{pan.preparerName || ' '}</div><div>HR Head</div><b>PREPARED BY</b></div>
        {approvers.map(step => <div className="pan-signature" key={step.id}>{step.status === PANStepStatus.Approved && step.signatureUrl && <img src={step.signatureUrl} alt={`${step.name} signature`} />}<div className="pan-signature-name">{step.name}</div><div>{step.position}</div><b>{step.role}</b></div>)}
        <div className="pan-signature">{pan.signatureDataUrl && <img src={pan.signatureDataUrl} alt="Employee signature" />}<div className="pan-signature-name">{pan.signatureName || ' '}</div><div>Employee’s Name</div><b>RECEIVED BY</b></div>
      </div>
      <div className="pan-footer">TNG-HRD-022 · PAN-{pan.id.slice(0, 8).toUpperCase()} · {pan.status}</div>
    </div>
  </div>;
};

export default PrintablePAN;

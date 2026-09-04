import React, { useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import { COEDocumentData } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { renderCoeBody } from '../../services/coeDocument';
import { recordCoeDocumentEvent } from '../../services/coeService';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import COEDocumentPreview from './COEDocumentPreview';
import GmailSenderField from '../integrations/GmailSenderField';
import { useGmailConnection } from '../../hooks/useGmailConnection';
import { sendHrisEmail } from '../../services/gmailConnectionService';

interface PrintableCOEProps {
  documentData: COEDocumentData;
  onClose: () => void;
}

const safeFilePart = (value: string) => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80);

const PrintableCOE: React.FC<PrintableCOEProps> = ({ documentData, onClose }) => {
  const { settings } = useSettings();
  const { request, template, employee, meta } = documentData;
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(employee.email || '');
  const { connection: gmailConnection, loading: gmailLoading } = useGmailConnection(isEmailModalOpen);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  const currency = /^[A-Z]{3}$/.test(settings.currency || '') ? settings.currency : 'PHP';

  const renderedBody = useMemo(
    () => renderCoeBody(template, request, employee, currency),
    [template, request, employee, currency],
  );

  const generatePdf = async () => {
    if (!pdfRef.current) throw new Error('The COE preview is not ready yet.');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    await pdf.html(pdfRef.current, {
      x: 0,
      y: 0,
      width: 595.28,
      windowWidth: 794,
      autoPaging: 'text',
      html2canvas: { scale: 0.75, useCORS: true, backgroundColor: '#ffffff' },
    });
    return pdf;
  };

  const handlePrint = async () => {
    await recordCoeDocumentEvent(request.id, 'PRINT');
    window.print();
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const pdf = await generatePdf();
      pdf.save(`Certificate_of_Employment_${safeFilePart(employee.name)}_${request.id.slice(0, 8)}.pdf`);
      await recordCoeDocumentEvent(request.id, 'DOWNLOAD');
    } catch (error: any) {
      alert(error?.message || 'Unable to download the COE PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailRecipient || !emailRecipient.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }

    setIsSending(true);
    try {
      const pdf = await generatePdf();
      const pdfBase64 = String(pdf.output('datauristring')).split(',')[1] || '';
      if (!pdfBase64) throw new Error('Unable to generate the COE PDF.');

      await sendHrisEmail({
        to: emailRecipient,
        subject: `Certificate of Employment - ${employee.name}`,
        message: `Your Certificate of Employment has been issued. Request ID: ${request.id}`,
        html: `<p>Dear ${employee.name.split(' ')[0]},</p><p>Your Certificate of Employment has been issued.</p><hr />${renderedBody}<p>Request ID: ${request.id}</p>`,
        attachments: [{
          filename: `Certificate_of_Employment_${safeFilePart(employee.name)}.pdf`,
          contentBase64: pdfBase64,
          contentType: 'application/pdf',
        }],
        documentType: 'coe',
        documentId: request.id,
      });
      await recordCoeDocumentEvent(request.id, 'EMAIL');
      alert(`Certificate successfully emailed to ${emailRecipient}.`);
      setIsEmailModalOpen(false);
    } catch (error: any) {
      alert(error?.message || 'Failed to send email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="print-overlay">
      <style>{`
        @media screen {
          .print-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; flex-direction: column; background: #323639; }
          .print-toolbar { z-index: 2010; flex-shrink: 0; background: white; padding: 0.85rem 1.25rem; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
          .print-scroll-container { flex: 1; overflow: auto; padding: 2rem; }
          .print-page-container { width: max-content; min-width: 210mm; margin: 0 auto; box-shadow: 0 0 16px rgba(0,0,0,.55); }
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body > *:not(.print-overlay) { display: none !important; }
          .print-overlay { position: static; width: 210mm; height: auto; background: white; }
          .print-toolbar, .no-print { display: none !important; }
          .print-scroll-container { display: block; padding: 0; overflow: visible; }
          .print-page-container { width: 210mm; min-width: 210mm; margin: 0; box-shadow: none; }
          [data-coe-document] { break-after: page; }
        }
      `}</style>

      <div className="print-toolbar no-print">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Certificate Preview</h3>
            <p className="text-xs text-gray-500">Immutable document v{meta.documentVersion} · Request {request.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setIsEmailModalOpen(true)}>Email</Button>
            <Button variant="secondary" onClick={handleDownload} disabled={isGenerating}>
              {isGenerating ? 'Preparing PDF…' : 'Download PDF'}
            </Button>
            <Button variant="secondary" onClick={handlePrint}>Print</Button>
            <Button variant="danger" onClick={onClose}>Close</Button>
          </div>
        </div>
        {meta.generationSource === 'fallback' && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A protected same-business-unit fallback was used. {meta.fallbackReason}
          </div>
        )}
        {meta.salaryRedacted && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Salary is hidden for your current access level.
          </div>
        )}
      </div>

      <div className="print-scroll-container">
        <div className="print-page-container">
          <COEDocumentPreview
            ref={pdfRef}
            template={template}
            request={request}
            employee={employee}
            currency={currency}
          />
        </div>
      </div>

      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Email Certificate"
        footer={(
          <div className="flex w-full justify-end space-x-2">
            <Button variant="secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={isSending || gmailLoading || !gmailConnection.connected}>{isSending ? 'Sending…' : gmailConnection.connected ? 'Send Email' : 'Connect Gmail to send'}</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">The exact approved COE PDF shown in the preview will be attached.</p>
          <GmailSenderField enabled={isEmailModalOpen} />
          <Input
            label="Recipient Email Address"
            type="email"
            value={emailRecipient}
            onChange={event => setEmailRecipient(event.target.value)}
            required
          />
        </div>
      </Modal>
    </div>
  );
};

export default PrintableCOE;

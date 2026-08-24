import React, { useMemo, useRef, useState } from 'react';
import { Envelope } from '../../types';
import Button from '../ui/Button';
import { useUsers } from '../../hooks/useHRData';

interface PrintableContractProps {
    envelope: Envelope;
    onClose: () => void;
}

const defaults = {
    pageSize: 'A4' as const,
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
    fontFamily: 'Times New Roman',
    fontSizePt: 12,
    lineHeight: 1.45,
    showPageNumbers: false,
    showFooter: true,
};

const clamp = (value: number | undefined, minimum: number, maximum: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Number(value))) : fallback;

const PrintableContract: React.FC<PrintableContractProps> = ({ envelope, onClose }) => {
    const { users } = useUsers();
    const [downloading, setDownloading] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const { contentSnapshot, employeeName, employeeId } = envelope;
    const employee = users.find(user => user.id === employeeId);
    const settings = { ...defaults, ...(contentSnapshot?.documentSettings || {}) };
    const pageWidthMm = settings.pageSize === 'Letter' ? 215.9 : 210;
    const pageHeightMm = settings.pageSize === 'Letter' ? 279.4 : 297;
    const marginTop = clamp(settings.marginTopMm, 8, 45, defaults.marginTopMm);
    const marginRight = clamp(settings.marginRightMm, 8, 45, defaults.marginRightMm);
    const marginBottom = clamp(settings.marginBottomMm, 8, 45, defaults.marginBottomMm);
    const marginLeft = clamp(settings.marginLeftMm, 8, 45, defaults.marginLeftMm);
    const contentWidthMm = pageWidthMm - marginLeft - marginRight;
    const fontSize = clamp(settings.fontSizePt, 8, 18, defaults.fontSizePt);
    const lineHeight = clamp(settings.lineHeight, 1, 2.2, defaults.lineHeight);

    const processedContent = useMemo(() => {
        if (!contentSnapshot) return { body: '', sections: [], footer: '', acknowledgmentBody: '' };
        const replacePlaceholders = (text: string) => {
            let processed = text.replace(/{{employee_name}}/g, employeeName);
            processed = processed.replace(/{{position}}/g, employee?.position || 'N/A');
            processed = processed.replace(/{{start_date}}/g, employee?.dateHired ? new Date(employee.dateHired).toLocaleDateString() : 'N/A');
            processed = processed.replace(/{{today}}/g, new Date().toLocaleDateString());
            processed = processed.replace(/{{rate}}/g, employee?.monthlySalary?.toLocaleString() || 'N/A');
            return processed;
        };
        return {
            body: replacePlaceholders(contentSnapshot.body || ''),
            sections: contentSnapshot.sections?.map(section => ({ ...section, body: replacePlaceholders(section.body) })) || [],
            footer: replacePlaceholders(contentSnapshot.footer || ''),
            acknowledgmentBody: replacePlaceholders(contentSnapshot.acknowledgmentBody || ''),
        };
    }, [contentSnapshot, employeeName, employee]);

    const downloadPdf = async () => {
        if (!contentRef.current) return;
        setDownloading(true);
        try {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: settings.pageSize === 'Letter' ? 'letter' : 'a4',
                compress: true,
            });
            await new Promise<void>((resolve, reject) => {
                try {
                    doc.html(contentRef.current as HTMLElement, {
                        callback: pdf => {
                            if (settings.showPageNumbers) {
                                const totalPages = pdf.getNumberOfPages();
                                for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
                                    pdf.setPage(pageNumber);
                                    pdf.setFontSize(8);
                                    pdf.setTextColor(75, 85, 99);
                                    pdf.text(
                                        `Page ${pageNumber} of ${totalPages}`,
                                        pageWidthMm / 2,
                                        pageHeightMm - Math.max(5, marginBottom / 2),
                                        { align: 'center' }
                                    );
                                }
                            }
                            const fileName = `${envelope.title || 'contract'}-${employeeName || 'employee'}`
                                .replace(/[^a-z0-9-_]+/gi, '-')
                                .replace(/-+/g, '-');
                            pdf.save(`${fileName}.pdf`);
                            resolve();
                        },
                        x: 0,
                        y: 0,
                        margin: [marginTop, marginRight, marginBottom, marginLeft],
                        width: contentWidthMm,
                        windowWidth: contentRef.current?.scrollWidth || 794,
                        autoPaging: 'text',
                        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                    } as any);
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            console.error('Failed to generate contract PDF', error);
            alert('The PDF could not be generated. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    const renderSignatories = () => (
        <div className="contract-keep contract-signatories">
            {contentSnapshot?.companySignatory && <div className="contract-signatory"><div className="contract-signature-line">&nbsp;</div><p><strong>{contentSnapshot.companySignatory.name || ''}</strong></p><p>{contentSnapshot.companySignatory.position || ''}</p><p>{contentSnapshot.companySignatory.company || ''}</p></div>}
            {contentSnapshot?.employeeSignatory && <div className="contract-signatory"><div className="contract-signature-line">&nbsp;</div><p><strong>{contentSnapshot.employeeSignatory.name?.replace('{{employee_name}}', employeeName) || ''}</strong></p><p>{contentSnapshot.employeeSignatory.position || ''}</p><p>{contentSnapshot.employeeSignatory.company || ''}</p></div>}
        </div>
    );

    return (
        <div className="contract-preview-overlay">
            <style>{`
                @page { size: ${settings.pageSize}; margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; }
                .contract-preview-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #e5e7eb; }
                .contract-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding: .75rem 1rem; background: white; border-bottom: 1px solid #d1d5db; }
                .contract-scroll { flex: 1; overflow: auto; padding: 24px; }
                .contract-sheet { box-sizing: border-box; width: ${pageWidthMm}mm; min-height: ${pageHeightMm}mm; margin: 0 auto; padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; background: white; color: #111827; box-shadow: 0 4px 20px rgba(15,23,42,.18); font-family: ${JSON.stringify(settings.fontFamily)}, serif; font-size: ${fontSize}pt; line-height: ${lineHeight}; overflow-wrap: anywhere; }
                .contract-sheet p { margin: 0 0 .75em; }
                .contract-sheet h1, .contract-sheet h2, .contract-sheet h3 { break-after: avoid; page-break-after: avoid; margin: 1.25em 0 .5em; line-height: 1.2; }
                .contract-sheet h1 { font-size: 1.5em; } .contract-sheet h2 { font-size: 1.25em; } .contract-sheet h3 { font-size: 1.08em; }
                .contract-sheet table { width: 100%; border-collapse: collapse; break-inside: avoid; page-break-inside: avoid; }
                .contract-sheet td, .contract-sheet th { border: 1px solid #9ca3af; padding: .4em; vertical-align: top; }
                .contract-sheet img { max-width: 100%; height: auto; object-fit: contain; }
                .contract-section { margin-top: 1.25em; }
                .contract-keep { break-inside: avoid; page-break-inside: avoid; }
                .contract-signatories { display: flex; justify-content: space-between; gap: 10%; margin-top: 3rem; }
                .contract-signatory { width: 45%; text-align: center; }
                .contract-signatory p { margin: .2rem 0; }
                .contract-signature-line { border-bottom: 1px solid #111; min-height: 2rem; }
                .contract-acknowledgment { break-before: page; page-break-before: always; }
                .contract-footer { break-inside: avoid; margin-top: 2rem; border-top: 1px solid #d1d5db; padding-top: .5rem; text-align: center; font-size: .8em; color: #4b5563; }
                @media print {
                    body > *:not(.contract-preview-overlay) { display: none !important; }
                    .contract-preview-overlay { position: static; display: block; background: white; }
                    .contract-toolbar { display: none !important; }
                    .contract-scroll { overflow: visible; padding: 0; }
                    .contract-sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    .contract-sheet p { orphans: 3; widows: 3; }
                }
            `}</style>
            <header className="contract-toolbar">
                <div><strong>Document preview</strong><p className="text-xs text-gray-500">{settings.pageSize} · {marginTop}/{marginRight}/{marginBottom}/{marginLeft} mm margins</p></div>
                <div className="flex flex-wrap gap-2"><Button onClick={() => void downloadPdf()} disabled={downloading}>{downloading ? 'Generating PDF…' : 'Download PDF'}</Button><Button variant="secondary" onClick={() => window.print()}>Print</Button><Button variant="secondary" onClick={onClose}>Close</Button></div>
            </header>
            <main className="contract-scroll">
                <div className="contract-sheet">
                    <div ref={contentRef} className="contract-document-content">
                        {contentSnapshot?.logoUrl && <div className="contract-keep" style={{ textAlign: contentSnapshot.logoPosition || 'left', marginBottom: '1.25rem' }}><img src={contentSnapshot.logoUrl} alt="Business unit logo" style={{ width: 'auto', maxWidth: `${contentSnapshot.logoMaxWidth || 150}px`, maxHeight: '34mm', display: 'inline-block' }} /></div>}
                        <div dangerouslySetInnerHTML={{ __html: processedContent.body }} />
                        {processedContent.sections.map(section => <section className="contract-section" key={section.id}><h2>{section.title}</h2><div dangerouslySetInnerHTML={{ __html: section.body }} /></section>)}
                        {renderSignatories()}
                        {!!contentSnapshot?.witnesses?.length && <section className="contract-keep" style={{ marginTop: '2rem' }}><h3 style={{ textAlign: 'center' }}>SIGNED IN THE PRESENCE OF:</h3><div className="contract-signatories">{contentSnapshot.witnesses.map(witness => <div className="contract-signatory" key={witness.id}><div className="contract-signature-line">&nbsp;</div><p>{witness.name}</p></div>)}</div></section>}
                        {!!processedContent.acknowledgmentBody && <section className="contract-acknowledgment" dangerouslySetInnerHTML={{ __html: processedContent.acknowledgmentBody }} />}
                        {settings.showFooter && <footer className="contract-footer"><div dangerouslySetInnerHTML={{ __html: processedContent.footer }} /></footer>}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PrintableContract;

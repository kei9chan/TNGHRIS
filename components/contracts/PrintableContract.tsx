import React, { useEffect, useMemo } from 'react';
import { Envelope } from '../../types';
import { mockUsers } from '../../services/mockData';
// FIX: Import the 'Button' component to resolve the 'Cannot find name' error.
import Button from '../ui/Button';

interface PrintableContractProps {
    envelope: Envelope;
    onClose: () => void;
}

const PrintableContract: React.FC<PrintableContractProps> = ({ envelope, onClose }) => {
    const { contentSnapshot, employeeName, employeeId } = envelope;
    const employee = mockUsers.find(u => u.id === employeeId);

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
            sections: contentSnapshot.sections?.map(section => ({
                ...section,
                body: replacePlaceholders(section.body)
            })) || [],
            footer: replacePlaceholders(contentSnapshot.footer || ''),
            acknowledgmentBody: replacePlaceholders(contentSnapshot.acknowledgmentBody || ''),
        };
    }, [contentSnapshot, employeeName, employee]);

    useEffect(() => {
        const handleAfterPrint = () => {
            onClose();
        };

        window.addEventListener('afterprint', handleAfterPrint);
        
        const timer = setTimeout(() => {
            window.print();
        }, 100);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [onClose]);
    
    const renderSignatories = () => (
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '4rem', pageBreakInside: 'avoid' }}>
            {contentSnapshot?.companySignatory && (
                <div style={{ width: '40%', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid black', paddingBottom: '0.25rem' }}>&nbsp;</div>
                    <p style={{ fontWeight: 'bold', margin: '0.25rem 0 0 0' }}>{contentSnapshot.companySignatory.name || ''}</p>
                    <p style={{ margin: 0 }}>{contentSnapshot.companySignatory.position || ''}</p>
                    <p style={{ margin: 0 }}>{contentSnapshot.companySignatory.company || ''}</p>
                </div>
            )}
             {contentSnapshot?.employeeSignatory && (
                <div style={{ width: '40%', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid black', paddingBottom: '0.25rem' }}>&nbsp;</div>
                    <p style={{ fontWeight: 'bold', margin: '0.25rem 0 0 0' }}>{contentSnapshot.employeeSignatory.name?.replace('{{employee_name}}', employeeName) || ''}</p>
                    <p style={{ margin: 0 }}>{contentSnapshot.employeeSignatory.position || ''}</p>
                    <p style={{ margin: 0 }}>{contentSnapshot.employeeSignatory.company || ''}</p>
                </div>
            )}
        </div>
    );
    
    const renderWitnesses = () => (
        <div style={{ marginTop: '2rem', pageBreakInside: 'avoid' }}>
            <h3 style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '1rem' }}>SIGNED IN THE PRESENCE OF:</h3>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                {contentSnapshot?.witnesses?.map(witness => (
                    <div key={witness.id} style={{ width: '40%', textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid black', paddingBottom: '0.25rem' }}>&nbsp;</div>
                        <p style={{ margin: '0.25rem 0 0 0' }}>{witness.name}</p>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="print-overlay">
            <style>
                {`
                @media screen {
                    .print-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
                    .print-content-wrapper { background-color: white; width: 210mm; height: 297mm; overflow-y: auto; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
                    .no-print { display: block; }
                }
                @media print {
                    @page { size: A4; margin: 20mm; }
                    body > *:not(.print-overlay) { display: none !important; }
                    .print-overlay, .print-content-wrapper, .print-content { all: unset; }
                    .print-content { font-family: 'Times New Roman', serif; font-size: 12pt; color: black; }
                    .print-content h1 { font-size: 16pt; font-weight: bold; }
                    .print-content h2 { font-size: 14pt; font-weight: bold; }
                    .print-content h3 { font-size: 12pt; font-weight: bold; }
                    .print-content p, .print-content div { margin-bottom: 1em; }
                    .page-footer { position: fixed; bottom: 0; width: 100%; text-align: center; }
                    .no-print { display: none !important; }
                }
                `}
            </style>
            <div className="print-content-wrapper">
                 <div className="no-print p-4 bg-gray-200 text-center">
                    <p>Preparing document for printing...</p>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                </div>
                <div className="print-content p-8">
                    {contentSnapshot?.logoUrl && (
                        <div style={{ textAlign: contentSnapshot.logoPosition || 'left', marginBottom: '2rem' }}>
                            <img src={contentSnapshot.logoUrl} alt="Logo" style={{ maxWidth: `${contentSnapshot.logoMaxWidth || 150}px`, display: 'inline-block' }} />
                        </div>
                    )}
                    <div dangerouslySetInnerHTML={{ __html: processedContent.body }} />
                    
                    {processedContent.sections.map(section => (
                        <div key={section.id}>
                            <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.5rem' }}>{section.title}</h2>
                            <div dangerouslySetInnerHTML={{ __html: section.body }} />
                        </div>
                    ))}

                    {renderSignatories()}
                    {contentSnapshot?.witnesses && contentSnapshot.witnesses.length > 0 && renderWitnesses()}
                    
                    {contentSnapshot?.acknowledgmentBody && (
                        <div style={{ pageBreakBefore: 'always' }}>
                             <div dangerouslySetInnerHTML={{ __html: processedContent.acknowledgmentBody }} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PrintableContract;
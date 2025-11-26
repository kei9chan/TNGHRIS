import React, { useEffect } from 'react';
import { IncidentReport } from '../../types';
import { mockUsers } from '../../services/mockData';

interface PrintableIncidentReportProps {
    report: IncidentReport;
    onClose: () => void;
}

const PrintableIncidentReport: React.FC<PrintableIncidentReportProps> = ({ report, onClose }) => {
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

    const reporter = mockUsers.find(u => u.id === report.reportedBy);

    return (
        <div className="print-overlay">
            <style>
                {`
                @media screen {
                    .print-overlay {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background-color: rgba(0,0,0,0.7); z-index: 1000;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .print-content {
                        background-color: white; width: 210mm; height: 297mm;
                        overflow-y: auto; box-shadow: 0 0 15px rgba(0,0,0,0.5);
                    }
                }
                @media print {
                    body > *:not(.print-overlay) { display: none !important; }
                    .print-overlay, .print-content {
                        position: static; background-color: transparent;
                        width: auto; height: auto; box-shadow: none;
                    }
                    @page { size: A4; margin: 20mm; }
                }
                `}
            </style>
            <div className="print-content font-sans text-black p-8 text-sm">
                <div className="text-center mb-8 border-b pb-4">
                    <h1 className="text-2xl font-bold">CONFIDENTIAL INCIDENT REPORT</h1>
                    <p>Report ID: {report.id}</p>
                </div>
                
                <h2 className="font-bold text-base mb-2">I. INCIDENT DETAILS</h2>
                <table className="w-full border-collapse border mb-6">
                    <tbody>
                        <tr><td className="p-2 font-semibold border w-1/4">Date & Time of Incident:</td><td className="p-2 border">{new Date(report.dateTime).toLocaleString()}</td></tr>
                        <tr><td className="p-2 font-semibold border">Location:</td><td className="p-2 border">{report.location}</td></tr>
                        <tr><td className="p-2 font-semibold border">Category:</td><td className="p-2 border">{report.category}</td></tr>
                    </tbody>
                </table>

                <h2 className="font-bold text-base mb-2">II. PERSON(S) INVOLVED</h2>
                <table className="w-full border-collapse border mb-6">
                     <tbody>
                        <tr><td className="p-2 font-semibold border w-1/4">Involved Employee(s):</td><td className="p-2 border">{report.involvedEmployeeNames.join(', ')}</td></tr>
                        <tr><td className="p-2 font-semibold border">Witness(es):</td><td className="p-2 border">{report.witnessNames.join(', ') || 'None'}</td></tr>
                    </tbody>
                </table>
                
                <h2 className="font-bold text-base mb-2">III. DESCRIPTION OF INCIDENT</h2>
                <div className="border p-2 mb-6 min-h-[150px] whitespace-pre-wrap">
                    {report.description}
                </div>

                <h2 className="font-bold text-base mb-2">IV. ATTACHMENTS</h2>
                 <div className="border p-2 mb-8 min-h-[30px]">
                    {report.attachmentUrl || 'None'}
                </div>
                
                <div className="mt-16 grid grid-cols-2 gap-16 text-center">
                     <div>
                        {report.signatureDataUrl && (
                            <img src={report.signatureDataUrl} alt="Signature" className="mx-auto max-h-20 mb-2" />
                        )}
                        <p className="border-t border-black pt-1 font-semibold uppercase">{reporter?.name || 'N/A'}</p>
                        <p>Name & Signature of Reporting Person</p>
                    </div>
                     <div>
                        <div className="h-20 mb-2"></div>
                        <p className="border-t border-black pt-1 font-semibold uppercase">&nbsp;</p>
                        <p>Received by HR Department</p>
                    </div>
                </div>

                <div className="absolute bottom-8 right-8 text-xs text-gray-500">
                    Document Generated: {new Date().toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export default PrintableIncidentReport;
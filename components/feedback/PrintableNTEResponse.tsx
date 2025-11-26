import React, { useEffect } from 'react';
import { NTE } from '../../types';
import { mockUsers } from '../../services/mockData';

interface PrintableNTEResponseProps {
    nte: NTE;
    onClose: () => void;
}

const PrintableNTEResponse: React.FC<PrintableNTEResponseProps> = ({ nte, onClose }) => {
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

    const employee = mockUsers.find(u => u.id === nte.employeeId);

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
                    <h1 className="text-2xl font-bold">WRITTEN EXPLANATION</h1>
                    <p>In Response to Notice to Explain: {nte.id}</p>
                </div>
                
                <table className="w-full text-sm mb-6 border-collapse">
                    <tbody>
                        <tr className="border-t border-b"><td className="p-2 font-bold w-1/4">Employee Name:</td><td className="p-2">{nte.employeeName}</td></tr>
                        <tr className="border-b"><td className="p-2 font-bold">Position:</td><td className="p-2">{employee?.position}</td></tr>
                        <tr className="border-b"><td className="p-2 font-bold">Date Submitted:</td><td className="p-2">{nte.responseDate ? new Date(nte.responseDate).toLocaleString() : new Date().toLocaleString()}</td></tr>
                    </tbody>
                </table>

                <h2 className="font-bold text-base mb-2">I. RESPONSE DETAILS</h2>
                <div className="border p-2 mb-6 min-h-[300px] whitespace-pre-wrap">
                    {nte.employeeResponse}
                </div>

                <h2 className="font-bold text-base mb-2">II. SUPPORTING EVIDENCE</h2>
                 <div className="border p-2 mb-8 min-h-[30px] break-all">
                    {nte.employeeResponseEvidenceUrl ? <a href={nte.employeeResponseEvidenceUrl} className="text-blue-600 underline">{nte.employeeResponseEvidenceUrl}</a> : 'None provided.'}
                </div>
                
                <div className="mt-16">
                    <div className="w-1/2">
                        {nte.employeeResponseSignatureUrl && (
                            <img src={nte.employeeResponseSignatureUrl} alt="Signature" className="mx-auto max-h-20 mb-1" />
                        )}
                        <p className="border-t border-black pt-1 font-semibold uppercase text-center">{nte.employeeName}</p>
                        <p className="text-center">Signature over Printed Name</p>
                    </div>
                </div>

                <div className="absolute bottom-8 right-8 text-xs text-gray-500">
                    Document Generated: {new Date().toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export default PrintableNTEResponse;

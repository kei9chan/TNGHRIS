import React, { useEffect, useState, useMemo } from 'react';
import { IncidentReport } from '../../types';
import { mockUsers } from '../../services/mockData';
import { supabase } from '../../services/supabaseClient';

interface PrintableIncidentReportProps {
    report: IncidentReport;
    onClose: () => void;
}

const PrintableIncidentReport: React.FC<PrintableIncidentReportProps> = ({ report, onClose }) => {
    const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
    const [isReadyToPrint, setIsReadyToPrint] = useState(false);
    const isAttachmentImage = useMemo(() => {
        const candidate = attachmentUrl || report.attachmentUrl || '';
        if (/^data:image\//i.test(candidate)) return true;
        return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(candidate);
    }, [attachmentUrl, report.attachmentUrl]);

    const resolveStorageUrl = async (path?: string | null) => {
        if (!path) return null;
        if (/^(https?:)?data:/i.test(path)) return path;
        if (/^https?:\/\//i.test(path)) return path;
        const { data, error } = await supabase.storage.from('incident_reports_attachments').createSignedUrl(path, 60 * 60);
        if (!error && data?.signedUrl) return data.signedUrl;
        const { data: pub } = supabase.storage.from('incident_reports_attachments').getPublicUrl(path);
        return pub?.publicUrl || null;
    };

    useEffect(() => {
        const loadUrls = async () => {
            const [attResolved, sigResolved] = await Promise.all([
                resolveStorageUrl(report.attachmentUrl),
                resolveStorageUrl(report.signatureDataUrl),
            ]);

            const toData = async (url?: string | null) => {
                if (!url) return null;
                try {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => reject(new Error('Failed to read blob'));
                        reader.readAsDataURL(blob);
                    });
                } catch {
                    return url;
                }
            };

            if (sigResolved) {
                const dataSig = await toData(sigResolved);
                if (dataSig) setSignatureUrl(dataSig);
            }

            if (attResolved) {
                const dataAtt = await toData(attResolved);
                if (dataAtt) setAttachmentUrl(dataAtt);
            }

            setIsReadyToPrint(true);
        };
        loadUrls();
    }, [report]);

    useEffect(() => {
        if (!isReadyToPrint) return;
        const handleAfterPrint = () => {
            onClose();
        };

        window.addEventListener('afterprint', handleAfterPrint);
        
        const timer = setTimeout(() => {
            window.print();
        }, 200);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [onClose, isReadyToPrint]);

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
                    {attachmentUrl ? (
                        isAttachmentImage ? (
                            <img src={attachmentUrl} alt="Attachment" className="max-h-64 object-contain" />
                        ) : (
                            <span className="break-all text-xs">{attachmentUrl}</span>
                        )
                    ) : report.attachmentUrl ? report.attachmentUrl : 'None'}
                </div>
                
                <div className="mt-16 grid grid-cols-2 gap-16 text-center">
                     <div>
                        {signatureUrl && (
                            <img src={signatureUrl} alt="Signature" className="mx-auto max-h-20 mb-2" />
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

import React, { useEffect, useMemo, useRef } from 'react';
import { PAN, PANRole, PANStepStatus } from '../../types';
import { mockUsers } from '../../services/mockData';
import { useSettings } from '../../context/SettingsContext';

interface PrintablePANProps {
    pan: PAN;
    onClose: () => void;
    onRendered?: (element: HTMLElement, pan: PAN) => void;
    isVisible?: boolean;
}

const DetailRow: React.FC<{ label: string; from: string | number; to: string | number }> = ({ label, from, to }) => (
  <tr className="border-t">
    <td className="px-2 py-1 font-semibold">{label}</td>
    <td className="px-2 py-1">{from}</td>
    <td className="px-2 py-1">{to}</td>
  </tr>
);

const PrintablePAN: React.FC<PrintablePANProps> = ({ pan, onClose, onRendered, isVisible = true }) => {
    const { settings } = useSettings();
    const employee = mockUsers.find(u => u.id === pan.employeeId);
    const printContentRef = useRef<HTMLDivElement>(null);
    
    const approvers = useMemo(() => pan.routingSteps
        .filter(step => step.role !== PANRole.Acknowledger)
        .sort((a, b) => a.order - b.order)
        .map(step => {
            const approverUser = mockUsers.find(u => u.id === step.userId);
            return {
                ...step,
                position: approverUser?.position || step.role,
                signatureUrl: approverUser?.signatureUrl,
            };
        }), [pan.routingSteps]);

    const preparer = pan.preparerName ? {
        name: pan.preparerName,
        signatureUrl: pan.preparerSignatureUrl,
        position: 'HR Head'
    } : null;


    useEffect(() => {
        if (onRendered) {
            const timer = setTimeout(() => {
                if (printContentRef.current) {
                    onRendered(printContentRef.current, pan);
                }
            }, 500); // Give it time to render images etc.
            return () => clearTimeout(timer);
        } else {
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
        }
    }, [onClose, onRendered, pan]);
    
    const fromSalary = pan.particulars.from.salary || { basic: 0, deminimis: 0, reimbursable: 0 };
    const toSalary = pan.particulars.to.salary || { basic: 0, deminimis: 0, reimbursable: 0 };
    const fromTotal = fromSalary.basic + fromSalary.deminimis + fromSalary.reimbursable;
    const toTotal = toSalary.basic + toSalary.deminimis + toSalary.reimbursable;


    return (
        <div className={`print-overlay ${!isVisible ? 'invisible' : ''}`}>
            <style>
                {`
                @media screen {
                    .print-overlay:not(.invisible) {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background-color: rgba(0,0,0,0.7); z-index: 1000;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .print-content-wrapper {
                        background-color: white; width: 210mm; height: 297mm;
                        overflow-y: auto; box-shadow: 0 0 15px rgba(0,0,0,0.5);
                    }
                }
                @media print {
                    body > *:not(.print-overlay) { display: none !important; }
                    .print-overlay, .print-content-wrapper, .print-content {
                        all: unset;
                    }
                    @page { size: A4; margin: 20mm; }
                }
                .print-content { font-family: 'Times New Roman', serif; font-size: 11pt; color: black; }
                .print-content h1 { font-size: 18pt; font-weight: bold; }
                .print-content h2 { font-size: 12pt; font-weight: bold; }
                .print-content p, .print-content div { margin-bottom: 0.5em; }
                `}
            </style>
            <div className="print-content-wrapper">
                <div ref={printContentRef} className="print-content p-8">
                    <div className="text-center mb-8">
                        {pan.logoUrl && (
                            <img src={pan.logoUrl} alt="Company Logo" className="h-20 mx-auto mb-4" />
                        )}
                        <h1 className="text-2xl font-bold">PERSONNEL ACTION NOTICE</h1>
                        <p className="text-sm">PAN ID: {pan.id}</p>
                    </div>

                    <table className="w-full text-sm mb-6 border-collapse">
                        <tbody>
                            <tr className="border-t border-b"><td className="p-2 font-bold">Employee Name:</td><td className="p-2">{pan.employeeName}</td><td className="p-2 font-bold">Effectivity Date:</td><td className="p-2">{new Date(pan.effectiveDate).toLocaleDateString()}</td></tr>
                            <tr className="border-b"><td className="p-2 font-bold">Position:</td><td className="p-2">{employee?.position}</td><td className="p-2 font-bold">Date Hired:</td><td className="p-2">{employee?.dateHired?.toLocaleDateString()}</td></tr>
                            <tr className="border-b"><td className="p-2 font-bold">Department:</td><td className="p-2">{employee?.department}</td><td className="p-2 font-bold">Tenure:</td><td className="p-2">{pan.tenure}</td></tr>
                        </tbody>
                    </table>
                    
                    <h2 className="font-bold text-lg mb-2">ACTION TAKEN</h2>
                    <div className="text-sm mb-6">
                        {Object.entries(pan.actionTaken).filter(([_, value]) => value).map(([key, value]) => (
                            <div key={key}>✓ {key.replace(/([A-Z])/g, ' $1').trim()}{typeof value === 'string' && value ? `: ${value}` : ''}</div>
                        ))}
                    </div>

                    <h2 className="font-bold text-lg mb-2">PARTICULARS OF CHANGE</h2>
                    <table className="w-full text-sm mb-6 border-collapse border">
                        <thead>
                            <tr className="bg-gray-100"><th className="px-2 py-1 text-left">Particulars</th><th className="px-2 py-1 text-left">From</th><th className="px-2 py-1 text-left">To</th></tr>
                        </thead>
                        <tbody>
                            <DetailRow label="Employment Status" from={pan.particulars.from.employmentStatus || 'N/A'} to={pan.particulars.to.employmentStatus || 'N/A'} />
                            <DetailRow label="Position" from={pan.particulars.from.position || 'N/A'} to={pan.particulars.to.position || 'N/A'} />
                            <DetailRow label="Department" from={pan.particulars.from.department || 'N/A'} to={pan.particulars.to.department || 'N/A'} />
                            <tr className="border-t"><td className="px-2 py-1 font-semibold" rowSpan={4}>Salary</td><td className="px-2 py-1">Basic: {settings.currency} {fromSalary.basic.toLocaleString()}</td><td className="px-2 py-1">Basic: {settings.currency} {toSalary.basic.toLocaleString()}</td></tr>
                            <tr><td className="px-2 py-1">Deminimis: {settings.currency} {fromSalary.deminimis.toLocaleString()}</td><td className="px-2 py-1">Deminimis: {settings.currency} {toSalary.deminimis.toLocaleString()}</td></tr>
                            <tr><td className="px-2 py-1">Reimbursable: {settings.currency} {fromSalary.reimbursable.toLocaleString()}</td><td className="px-2 py-1">Reimbursable: {settings.currency} {toSalary.reimbursable.toLocaleString()}</td></tr>
                            <tr className="font-bold bg-gray-50"><td className="px-2 py-1">Total: {settings.currency} {fromTotal.toLocaleString()}</td><td className="px-2 py-1">Total: {settings.currency} {toTotal.toLocaleString()}</td></tr>
                        </tbody>
                    </table>
                    
                    <h2 className="font-bold text-lg mb-2">REMARKS / JUSTIFICATIONS</h2>
                    <p className="text-sm mb-8 border p-2 min-h-[50px]">{pan.notes}</p>

                    <div className="mt-16 flex flex-wrap justify-around items-start gap-x-4 gap-y-8 text-center text-xs">
                        {preparer && (
                            <div className="pt-4 w-40 flex flex-col justify-between" style={{ minHeight: '120px' }}>
                                <div className="h-16 mb-2 flex items-end justify-center">
                                    {preparer.signatureUrl && <img src={preparer.signatureUrl} alt="Preparer Signature" className="max-h-16" />}
                                </div>
                                <div>
                                    <p className="border-t border-black pt-1 font-semibold uppercase">{preparer.name}</p>
                                    <p>{preparer.position}</p>
                                    <p className="font-bold mt-2">PREPARED BY</p>
                                </div>
                            </div>
                        )}
                        {approvers.map(approver => (
                            <div key={approver.id} className="pt-4 w-40 flex flex-col justify-between" style={{ minHeight: '120px' }}>
                                <div className="h-16 mb-2 flex items-center justify-center">
                                    {approver.status === PANStepStatus.Approved ? (
                                        approver.signatureUrl ? (
                                            <img src={approver.signatureUrl} alt={`${approver.name} Signature`} className="max-h-16" />
                                        ) : (
                                            <span className="text-sm italic text-gray-500">[Electronically Approved]</span>
                                        )
                                    ) : (
                                        <>&nbsp;</>
                                    )}
                                </div>
                                <div>
                                    <p className="border-t border-black pt-1 font-semibold uppercase">{approver.name}</p>
                                    <p>{approver.position}</p>
                                    <p className="font-bold mt-2 uppercase">{approver.role}</p>
                                </div>
                            </div>
                        ))}
                        <div className="pt-4 w-40 flex flex-col justify-between" style={{ minHeight: '120px' }}>
                            <div className="h-16 mb-2 flex items-end justify-center">
                                {pan.signatureDataUrl && <img src={pan.signatureDataUrl} alt="Employee Signature" className="max-h-16" />}
                            </div>
                            <div>
                                <p className="border-t border-black pt-1 font-semibold uppercase">{pan.signatureName || <>&nbsp;</>}</p>
                                <p>Employee's Name</p>
                                <p className="font-bold mt-2">RECEIVED BY</p>
                            </div>
                        </div>
                    </div>

                    <p className="text-right text-xs mt-4">TNG-HRD-022</p>
                </div>
            </div>
        </div>
    );
};

export default PrintablePAN;
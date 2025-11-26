import React, { useEffect } from 'react';
import { PayslipRecord } from '../../types';
import Button from '../ui/Button';

interface PrintablePayslipsProps {
  payslips: PayslipRecord[];
  onClose: () => void;
}

const SinglePayslip: React.FC<{ payslip: PayslipRecord }> = ({ payslip }) => {
    const formatDateRange = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        return `${new Date(start).toLocaleDateString(undefined, options)} - ${new Date(end).toLocaleDateString(undefined, options)}`;
    };

    const totalEarnings = (p: PayslipRecord) =>
        (p.earningsBreakdown?.regularPay || 0) +
        (p.earningsBreakdown?.otPay || 0) +
        (p.earningsBreakdown?.allowances || 0);

    const totalDeductions = (p: PayslipRecord) =>
        (p.deductionsBreakdown?.sss || 0) +
        (p.deductionsBreakdown?.pagibig || 0) +
        (p.deductionsBreakdown?.philhealth || 0) +
        (p.deductionsBreakdown?.tax || 0);

    const calculatedNetPay = totalEarnings(payslip) - totalDeductions(payslip);

    return (
        <div className="payslip-container p-4 font-sans text-gray-800 text-sm">
            <div className="text-center mb-4 border-b pb-2">
                <h1 className="text-lg font-bold">CoreHR Solutions Inc.</h1>
                <p className="text-base">Payslip</p>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
                <div>
                    <p className="text-xs text-gray-500">Employee Name</p>
                    <p className="font-semibold">{payslip.employeeName}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500">Pay Period</p>
                    <p className="font-semibold">{formatDateRange(payslip.payPeriodStart, payslip.payPeriodEnd)}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 mb-4">
                <div>
                    <h3 className="text-base font-semibold border-b pb-1 mb-1">Earnings</h3>
                    <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span>Regular Pay</span><span>${(payslip.earningsBreakdown?.regularPay || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>OT Pay</span><span>${(payslip.earningsBreakdown?.otPay || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Allowances</span><span>${(payslip.earningsBreakdown?.allowances || 0).toFixed(2)}</span></div>
                    </div>
                </div>
                <div>
                    <h3 className="text-base font-semibold border-b pb-1 mb-1">Deductions</h3>
                    <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span>SSS</span><span>${(payslip.deductionsBreakdown?.sss || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Pag-IBIG</span><span>${(payslip.deductionsBreakdown?.pagibig || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>PhilHealth</span><span>${(payslip.deductionsBreakdown?.philhealth || 0).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>W/ Tax</span><span>${(payslip.deductionsBreakdown?.tax || 0).toFixed(2)}</span></div>
                    </div>
                </div>
            </div>
            
            <div className="border-t pt-2 mt-2">
                <div className="flex justify-end">
                    <div className="w-1/2 space-y-1">
                        <div className="flex justify-between font-semibold">
                            <span>Total Earnings</span>
                            <span>${totalEarnings(payslip).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-semibold">
                            <span>Total Deductions</span>
                            <span>${totalDeductions(payslip).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg border-t mt-1 pt-1 text-green-700">
                            <span>Net Pay</span>
                            <span>${calculatedNetPay.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const PrintablePayslips: React.FC<PrintablePayslipsProps> = ({ payslips, onClose }) => {

    useEffect(() => {
        const handleAfterPrint = () => {
            onClose();
        };

        window.addEventListener('afterprint', handleAfterPrint);
        
        // Delay print slightly to ensure all content is rendered
        const timer = setTimeout(() => {
            window.print();
        }, 100);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, [onClose]);

    return (
        <div className="print-overlay">
             <style>
                {`
                @media screen {
                    .print-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0,0,0,0.5);
                        z-index: 100;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .print-content {
                        background-color: white;
                        padding: 2rem;
                        border-radius: 0.5rem;
                        width: 210mm; /* A4 width */
                        height: 297mm; /* A4 height */
                        overflow-y: auto;
                    }
                    .no-print {
                        display: block;
                    }
                }
                @media print {
                    body > *:not(.print-overlay) {
                        display: none !important;
                    }
                    .print-overlay {
                        position: static;
                        background-color: transparent;
                    }
                    .print-content {
                        width: 100%;
                        height: auto;
                        padding: 0;
                        margin: 0;
                        overflow: visible;
                        box-shadow: none;
                        border: none;
                    }
                    .payslip-container {
                        border: 2px dashed #ccc;
                        page-break-inside: avoid;
                        height: 48vh; /* Roughly two per page with margins */
                        display: flex;
                        flex-direction: column;
                    }
                    .payslip-container:not(:last-child) {
                       margin-bottom: 2vh;
                    }
                     .cut-here {
                        display: block !important;
                        text-align: center;
                        border-bottom: 1px dashed #999;
                        margin: 1rem 0;
                        font-style: italic;
                        color: #999;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
                `}
            </style>
            <div className="print-content">
                <div className="no-print text-center mb-4">
                    <h2 className="text-2xl font-bold">Print Preview</h2>
                    <p>Your document is ready for printing.</p>
                    <Button onClick={onClose} variant="secondary" className="mt-2">Cancel</Button>
                </div>
                {payslips.map((p, index) => (
                    <React.Fragment key={p.id}>
                        <SinglePayslip payslip={p} />
                         {/* Add a cut-off line between every two payslips */}
                        {index % 2 === 0 && index < payslips.length -1 && (
                            <div className="cut-here" style={{display: 'none'}}>Cut Here</div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default PrintablePayslips;

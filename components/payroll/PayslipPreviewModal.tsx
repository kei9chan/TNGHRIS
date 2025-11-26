import React from 'react';
import { PayslipRecord } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface PayslipPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslip: PayslipRecord | null;
}

const PayslipPreviewModal: React.FC<PayslipPreviewModalProps> = ({ isOpen, onClose, payslip }) => {
  if (!payslip) return null;

  const handlePrint = () => {
    window.print();
  };

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
    <>
      <style>
        {`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-payslip, #printable-payslip * {
              visibility: visible;
            }
            #printable-payslip {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 20px;
            }
            .no-print {
              display: none;
            }
          }
        `}
      </style>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Payslip Preview"
        footer={
          <div className="flex justify-end w-full space-x-2 no-print">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={handlePrint}>Print</Button>
          </div>
        }
      >
        <div id="printable-payslip" className="font-sans text-gray-800 relative overflow-hidden">
          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none select-none">
            <span className="text-7xl md:text-8xl font-extrabold text-gray-200 dark:text-gray-700 -rotate-45 opacity-50">
              Company Confidential
            </span>
          </div>

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center mb-6 border-b pb-4">
              <h1 className="text-2xl font-bold">CoreHR Solutions Inc.</h1>
              <p className="text-lg">Payslip</p>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-gray-500">Employee Name</p>
                <p className="font-semibold">{payslip.employeeName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Pay Period</p>
                <p className="font-semibold">{formatDateRange(payslip.payPeriodStart, payslip.payPeriodEnd)}</p>
              </div>
            </div>

            {/* Earnings & Deductions */}
            <div className="grid grid-cols-2 gap-8 mb-6">
              {/* Earnings */}
              <div>
                <h3 className="text-lg font-semibold border-b pb-1 mb-2">Earnings</h3>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Regular Pay</span><span>${(payslip.earningsBreakdown?.regularPay || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>OT Pay</span><span>${(payslip.earningsBreakdown?.otPay || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Allowances</span><span>${(payslip.earningsBreakdown?.allowances || 0).toFixed(2)}</span></div>
                </div>
              </div>
              {/* Deductions */}
              <div>
                <h3 className="text-lg font-semibold border-b pb-1 mb-2">Deductions</h3>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>SSS</span><span>${(payslip.deductionsBreakdown?.sss || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Pag-IBIG</span><span>${(payslip.deductionsBreakdown?.pagibig || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>PhilHealth</span><span>${(payslip.deductionsBreakdown?.philhealth || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Withholding Tax</span><span>${(payslip.deductionsBreakdown?.tax || 0).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
            
            {/* Totals */}
            <div className="border-t pt-4">
              <div className="flex justify-end">
                  <div className="w-1/2 space-y-2">
                      <div className="flex justify-between font-semibold">
                          <span>Total Earnings</span>
                          <span>${totalEarnings(payslip).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                          <span>Total Deductions</span>
                          <span>${totalDeductions(payslip).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-xl border-t mt-2 pt-2 text-green-600">
                          <span>Net Pay</span>
                          <span>${calculatedNetPay.toFixed(2)}</span>
                      </div>
                  </div>
              </div>
            </div>
            
            {/* Signature Lines */}
            <div className="grid grid-cols-2 gap-16 mt-16 pt-8">
                <div className="border-t border-gray-800 pt-2 text-center text-sm">
                    Prepared by
                </div>
                <div className="border-t border-gray-800 pt-2 text-center text-sm">
                    Received by
                </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default PayslipPreviewModal;

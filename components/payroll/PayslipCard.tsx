import React from 'react';
import { PayslipRecord } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';

const ItemizedLine: React.FC<{ id: string; label: string; value?: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled: boolean; }> = ({ id, label, value, onChange, disabled }) => (
    <div className="flex justify-between items-center mt-2">
        <label htmlFor={id} className="text-sm text-gray-600 dark:text-gray-400 pl-4">{label}</label>
        <div className="flex items-center">
            <span className="text-sm text-gray-500 mr-1">$</span>
            <input
                id={id}
                type="number"
                value={value ?? ''}
                onChange={onChange}
                className="w-28 p-1 text-right bg-gray-100 dark:bg-gray-900/50 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                placeholder="0.00"
                step="0.01"
                disabled={disabled}
            />
        </div>
    </div>
);

interface PayslipCardProps {
    payslip: PayslipRecord;
    isHRView: boolean;
    isBODView: boolean;
    isEditable: boolean;
    onItemizedChange: (payslipId: string, breakdownType: 'earningsBreakdown' | 'deductionsBreakdown', field: string, value: string) => void;
    onPreview: (payslip: PayslipRecord) => void;
    onRegenerate: (payslip: PayslipRecord) => void;
    onPublish: (payslipId: string) => void;
    onUnpublish: (payslipId: string) => void;
    onDownloadSingle: (payslip: PayslipRecord) => void;
}

const PayslipCard: React.FC<PayslipCardProps> = ({ 
    payslip, 
    isHRView,
    isBODView,
    isEditable, 
    onItemizedChange, 
    onPreview, 
    onRegenerate, 
    onPublish, 
    onUnpublish, 
    onDownloadSingle 
}) => {

    const formatDateRange = (start: Date, end: Date) => {
        return `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`;
    };
    
    const isPublished = payslip.status === 'published';

    return (
        <Card key={payslip.id} className="divide-y divide-gray-200 dark:divide-gray-700 !p-0 flex flex-col">
            <div className="p-4 flex justify-between items-center">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Employee Name</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{payslip.employeeName}</p>
                </div>
                {isPublished && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
                        Published
                    </span>
                )}
            </div>

            <div className="p-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pay Period</p>
                <p className="text-base text-gray-700 dark:text-gray-300">{formatDateRange(payslip.payPeriodStart, payslip.payPeriodEnd)}</p>
            </div>

            <div className="p-4">
                <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Earnings</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">${payslip.totalEarnings.toFixed(2)}</p>
                </div>
                <ItemizedLine id={`${payslip.id}-regular`} label="Regular Pay" value={payslip.earningsBreakdown?.regularPay} onChange={(e) => onItemizedChange(payslip.id, 'earningsBreakdown', 'regularPay', e.target.value)} disabled={!isEditable} />
                <ItemizedLine id={`${payslip.id}-ot`} label="OT Pay" value={payslip.earningsBreakdown?.otPay} onChange={(e) => onItemizedChange(payslip.id, 'earningsBreakdown', 'otPay', e.target.value)} disabled={!isEditable} />
                <ItemizedLine id={`${payslip.id}-allowances`} label="Allowances" value={payslip.earningsBreakdown?.allowances} onChange={(e) => onItemizedChange(payslip.id, 'earningsBreakdown', 'allowances', e.target.value)} disabled={!isEditable} />
            </div>
            
            <div className="p-4">
                <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Deductions</p>
                    <p className="text-base font-medium text-gray-900 dark:text-white">${payslip.totalDeductions.toFixed(2)}</p>
                </div>
                <ItemizedLine id={`${payslip.id}-sss`} label="SSS" value={payslip.deductionsBreakdown?.sss} onChange={(e) => onItemizedChange(payslip.id, 'deductionsBreakdown', 'sss', e.target.value)} disabled={!isEditable} />
                <ItemizedLine id={`${payslip.id}-pagibig`} label="Pag-IBIG" value={payslip.deductionsBreakdown?.pagibig} onChange={(e) => onItemizedChange(payslip.id, 'deductionsBreakdown', 'pagibig', e.target.value)} disabled={!isEditable} />
                <ItemizedLine id={`${payslip.id}-philhealth`} label="PhilHealth" value={payslip.deductionsBreakdown?.philhealth} onChange={(e) => onItemizedChange(payslip.id, 'deductionsBreakdown', 'philhealth', e.target.value)} disabled={!isEditable} />
                <ItemizedLine id={`${payslip.id}-tax`} label="Withholding Tax" value={payslip.deductionsBreakdown?.tax} onChange={(e) => onItemizedChange(payslip.id, 'deductionsBreakdown', 'tax', e.target.value)} disabled={!isEditable} />
            </div>
            
            <div className="mt-auto">
                <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
                    <div className="flex justify-between items-center">
                        <p className="text-lg font-bold text-gray-800 dark:text-gray-200">Net Pay</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">${payslip.netPay.toFixed(2)}</p>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex space-x-2">
                        {isHRView || isBODView ? (
                            <Button className="w-full" onClick={() => onPreview(payslip)}>
                                Preview PDF
                            </Button>
                        ) : (
                            <Button className="w-full" onClick={() => onDownloadSingle(payslip)}>
                                Download PDF
                            </Button>
                        )}
                        {isHRView && (
                            <Button className="w-full" variant="secondary" onClick={() => onRegenerate(payslip)} disabled={isPublished}>
                                Regenerate
                            </Button>
                        )}
                    </div>
                    {isHRView && (
                        <div className="mt-2 flex space-x-2">
                            <Button 
                                className="w-full" 
                                onClick={() => onPublish(payslip.id)} 
                                disabled={isPublished}
                                title={isPublished ? 'This payslip is already published' : 'Make this payslip visible to the employee'}
                            >
                                Publish
                            </Button>
                            <Button 
                                className="w-full" 
                                variant="secondary" 
                                onClick={() => onUnpublish(payslip.id)}
                                disabled={!isPublished}
                                title={!isPublished ? 'This payslip is not published yet' : 'Revert to draft to allow editing'}
                            >
                                Unpublish
                            </Button>
                        </div>
                    )}
                    {payslip.lastGenerated && (
                        <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
                            Last generated on: {new Date(payslip.lastGenerated).toLocaleString()}
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
};

export default PayslipCard;

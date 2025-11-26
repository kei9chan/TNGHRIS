
import React, { useState, useMemo, useEffect } from 'react';
import { mockPayslips as allMockPayslips, mockUsers, mockBusinessUnits } from '../../services/mockData';
import { PayslipRecord, Role } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import PayslipPreviewModal from '../../components/payroll/PayslipPreviewModal';
import PrintablePayslips from '../../components/payroll/PrintablePayslips';
import PayslipCard from '../../components/payroll/PayslipCard';

const Payslips: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [allPayslips, setAllPayslips] = useState<PayslipRecord[]>(allMockPayslips);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [payslipToPrint, setPayslipToPrint] = useState<PayslipRecord | null>(null);
    const [selectedPayslip, setSelectedPayslip] = useState<PayslipRecord | null>(null);
    
    const isHRView = user?.role === Role.Admin || user?.role === Role.HRManager;
    const isBODView = user?.role === Role.BOD;
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const viewablePayslips = useMemo(() => {
        if (!user) return [];
        
        // Filter logic for Admin/HR: Must respect access scope
        if (isHRView || isBODView) {
            const accessibleBuNames = new Set(accessibleBus.map(b => b.name));
            
            return allPayslips.filter(p => {
                const employee = mockUsers.find(u => u.id === p.employeeId);
                const isAccessible = employee && accessibleBuNames.has(employee.businessUnit);
                
                // BOD sees only published, HR sees all within scope
                const statusCheck = isBODView ? p.status === 'published' : true;
                
                return isAccessible && statusCheck;
            });
        }
        
        // Employee View: Only own payslips
        return allPayslips.filter(p => p.employeeId === user.id && p.status === 'published');
    }, [user, allPayslips, isHRView, isBODView, accessibleBus]);

    const formatDateRange = (start: Date, end: Date) => {
        return `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`;
    };

    const payPeriods = useMemo(() => {
        const uniquePeriods = [...new Set(viewablePayslips.map(p => formatDateRange(p.payPeriodStart, p.payPeriodEnd)))];
        // FIX: Explicitly type the sort callback parameters to resolve the 'unknown' type error.
        return uniquePeriods.sort((a: string, b: string) => new Date(b.split(' - ')[0]).getTime() - new Date(a.split(' - ')[0]).getTime());
    }, [viewablePayslips]);
    
    const [selectedPeriod, setSelectedPeriod] = useState<string>('');
    
    useEffect(() => {
        if (payPeriods.length > 0 && !payPeriods.includes(selectedPeriod)) {
            setSelectedPeriod(payPeriods[0]);
        } else if (payPeriods.length === 0) {
            setSelectedPeriod('');
        }
    }, [payPeriods, selectedPeriod]);

    const filteredPayslips = useMemo(() => {
        if (!selectedPeriod) return [];
        return viewablePayslips.filter(p => formatDateRange(p.payPeriodStart, p.payPeriodEnd) === selectedPeriod);
    }, [viewablePayslips, selectedPeriod]);


    const handleItemizedChange = (
        payslipId: string,
        breakdownType: 'earningsBreakdown' | 'deductionsBreakdown',
        field: string,
        value: string
    ) => {
        const numericValue = parseFloat(value) || 0;
        setAllPayslips(prevPayslips =>
            prevPayslips.map(p => {
                if (p.id === payslipId) {
                    const updatedPayslip = { ...p };
                    const updatedBreakdown = { ...(updatedPayslip[breakdownType] || {}), [field]: numericValue };
                    updatedPayslip[breakdownType] = updatedBreakdown as any;

                    // Recalculate totals immediately
                    const totalEarnings =
                        (updatedPayslip.earningsBreakdown?.regularPay || 0) +
                        (updatedPayslip.earningsBreakdown?.otPay || 0) +
                        (updatedPayslip.earningsBreakdown?.allowances || 0);

                    const totalDeductions =
                        (updatedPayslip.deductionsBreakdown?.sss || 0) +
                        (updatedPayslip.deductionsBreakdown?.pagibig || 0) +
                        (updatedPayslip.deductionsBreakdown?.philhealth || 0) +
                        (updatedPayslip.deductionsBreakdown?.tax || 0);
                    
                    updatedPayslip.totalEarnings = totalEarnings;
                    updatedPayslip.totalDeductions = totalDeductions;
                    updatedPayslip.netPay = totalEarnings - totalDeductions;

                    return updatedPayslip;
                }
                return p;
            })
        );
    };

    const handlePreview = (payslip: PayslipRecord) => {
        setSelectedPayslip(payslip);
        setIsPreviewOpen(true);
    };
    
    const handleRegenerate = (payslip: PayslipRecord) => {
        setAllPayslips(prevPayslips =>
            prevPayslips.map(p => (p.id === payslip.id ? { ...payslip, lastGenerated: new Date() } : p))
        );
        handlePreview({ ...payslip, lastGenerated: new Date() });
    };
    
    const handlePublish = (payslipId: string) => {
        setAllPayslips(prev => prev.map(p => p.id === payslipId ? { ...p, status: 'published' } : p));
    };

    // FIX: Added handleUnpublish function to manage payslip status.
    const handleUnpublish = (payslipId: string) => {
        setAllPayslips(prev => prev.map(p => p.id === payslipId ? { ...p, status: 'unpublished' } : p));
    };
    
    const handleDownloadSingle = (payslip: PayslipRecord) => {
        setPayslipToPrint(payslip);
    };

    const handleMassPublish = () => {
        const unpublishedInPeriod = allPayslips.filter(p =>
            p.status !== 'published' &&
            formatDateRange(p.payPeriodStart, p.payPeriodEnd) === selectedPeriod
        );

        if (unpublishedInPeriod.length === 0) {
            alert('All payslips in this period are already published.');
            return;
        }
        if (window.confirm(`Are you sure you want to publish ${unpublishedInPeriod.length} payslip(s) in this period? This will lock them from editing.`)) {
            const unpublishedIdsInPeriod = new Set(unpublishedInPeriod.map(p => p.id));
            setAllPayslips(prev => prev.map(p =>
                unpublishedIdsInPeriod.has(p.id) ? { ...p, status: 'published' } : p
            ));
        }
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {isHRView ? 'Generated Payslip Records' : isBODView ? 'Published Payslips' : 'My Payslips'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                         {isHRView 
                            ? "This is an administrative view of all payslip records generated from the Payroll Staging module."
                            : isBODView
                            ? "Oversight view of all published payslip records."
                            : "View your published payslip records."
                         }
                    </p>
                </div>
                {isHRView && (
                    <div className="flex space-x-2">
                        <Button onClick={handleMassPublish}>Publish All Unpublished</Button>
                        <Button variant="secondary" onClick={() => setIsPrinting(true)} disabled={filteredPayslips.length === 0}>
                            Download All for Printing
                        </Button>
                    </div>
                )}
            </div>
            
            <Card>
                <div className="p-4 flex items-center space-x-4">
                    <label htmlFor="pay-period-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        Filter by Pay Period
                    </label>
                    <select
                        id="pay-period-filter"
                        value={selectedPeriod}
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="block w-full max-w-sm pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        {payPeriods.map(period => <option key={period} value={period}>{period}</option>)}
                    </select>
                </div>
            </Card>

            {filteredPayslips.length === 0 ? (
                 <Card>
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                        <p>No payslip records found for the selected period.</p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPayslips.map(p => (
                        <PayslipCard
                            key={p.id}
                            payslip={p}
                            isHRView={isHRView}
                            isBODView={isBODView}
                            isEditable={isHRView && p.status !== 'published'}
                            onItemizedChange={handleItemizedChange}
                            onPreview={handlePreview}
                            onRegenerate={handleRegenerate}
                            onPublish={handlePublish}
                            onUnpublish={handleUnpublish}
                            onDownloadSingle={handleDownloadSingle}
                        />
                    ))}
                </div>
            )}
            <PayslipPreviewModal 
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                payslip={selectedPayslip}
            />
            {isPrinting && (
                <PrintablePayslips 
                    payslips={filteredPayslips}
                    onClose={() => setIsPrinting(false)}
                />
            )}
            {payslipToPrint && (
                <PrintablePayslips
                    payslips={[payslipToPrint]}
                    onClose={() => setPayslipToPrint(null)}
                />
            )}
        </div>
    );
};

export default Payslips;

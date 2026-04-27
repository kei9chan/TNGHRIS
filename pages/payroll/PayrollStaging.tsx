import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PayrollStagingRecord, Role, PayslipRecord, Permission, RateType, User, BusinessUnit } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { logActivity } from '../../services/auditService';
import { fetchUsers, fetchBusinessUnits } from '../../services/userService';
import { fetchAttendanceRecords } from '../../services/timekeepingService';
import { savePayslip } from '../../services/payrollService';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const LockClosedIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
const LockOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>;
const PencilIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;

// Extended type to include hourly rate for display
interface ExtendedPayrollStagingRecord extends PayrollStagingRecord {
    derivedHourlyRate: number;
}

const PayrollStaging: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(lastDayOfMonth.toISOString().split('T')[0]);
    const [isLocked, setIsLocked] = useState(false);
    const [payrollData, setPayrollData] = useState<ExtendedPayrollStagingRecord[]>([]);
    const [editModes, setEditModes] = useState<Record<string, boolean>>({});
    const [editData, setEditData] = useState<Partial<PayrollStagingRecord>>({});
    const [payslipsGenerated, setPayslipsGenerated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Live data state
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

    const canManage = can('PayrollStaging', Permission.Manage);
    const canEdit = can('PayrollStaging', Permission.Edit);

    const accessibleBus = useMemo(
        () => getAccessibleBusinessUnits(businessUnits),
        [getAccessibleBusinessUnits, businessUnits]
    );

    // Load users and BUs on mount
    useEffect(() => {
        const loadMasterData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const [users, bus] = await Promise.all([fetchUsers(), fetchBusinessUnits()]);
                setAllUsers(users);
                setBusinessUnits(bus);
            } catch (err: any) {
                setError(err.message || 'Failed to load data.');
            } finally {
                setIsLoading(false);
            }
        };
        loadMasterData();
    }, []);

    const generatePayrollData = useCallback(async () => {
        if (allUsers.length === 0) return;
        try {
            setError(null);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const accessibleBuNames = new Set(accessibleBus.map(b => b.name));
            const relevantUsers = allUsers.filter(u =>
                u.role === Role.Employee &&
                accessibleBuNames.has(u.businessUnit)
            );

            const attendanceRecords = await fetchAttendanceRecords();

            const data: ExtendedPayrollStagingRecord[] = relevantUsers.map(employee => {
                const attendance = attendanceRecords.filter(r =>
                    r.employeeId === employee.id &&
                    new Date(r.date) >= start &&
                    new Date(r.date) <= end
                );

                // PHASE 4A: Base Salary Engine (Regular Hours Only)
                const regularHours = attendance.reduce((sum, r) => sum + ((r as any).totalWorkMinutes || ((r as any).hoursWorked || 0) * 60), 0) / 60;

                // Derive Hourly Rate based on Employee Rate Type
                let hourlyRate = 0;
                if (employee.rateType === RateType.Daily) {
                    hourlyRate = (employee.rateAmount || 0) / 8;
                } else {
                    // Monthly Rate / 176 hours (Standard 22 days * 8 hours)
                    hourlyRate = (employee.rateAmount || 0) / 176;
                }

                const grossPay = regularHours * hourlyRate;
                const overtimeHours = 0;
                const allowances = 0;
                const deductions = 0;
                const netPay = grossPay - deductions;

                return {
                    id: `${employee.id}-${startDate}`,
                    employeeId: employee.id,
                    employeeName: employee.name,
                    payPeriodStart: start,
                    payPeriodEnd: end,
                    regularHours,
                    overtimeHours,
                    allowances,
                    deductions,
                    grossPay,
                    netPay,
                    derivedHourlyRate: hourlyRate
                };
            });
            setPayrollData(data);
            setPayslipsGenerated(false);
        } catch (err: any) {
            setError(err.message || 'Failed to generate payroll data.');
        }
    }, [startDate, endDate, accessibleBus, allUsers]);

    useEffect(() => {
        if (!isLoading && allUsers.length >= 0) {
            generatePayrollData();
        }
    }, [generatePayrollData, isLoading]);

    const handleEdit = (record: PayrollStagingRecord) => {
        setEditModes(prev => ({ ...prev, [record.id]: true }));
        setEditData({ allowances: record.allowances, deductions: record.deductions });
    };

    const handleCancel = (recordId: string) => {
        setEditModes(prev => ({ ...prev, [recordId]: false }));
        setEditData({});
    };

    const handleSave = (recordId: string) => {
        setPayrollData(prev => prev.map(rec => {
            if (rec.id === recordId) {
                const allowances = editData.allowances ?? rec.allowances;
                const deductions = editData.deductions ?? rec.deductions;
                const basePay = rec.regularHours * rec.derivedHourlyRate;
                const grossPay = basePay + allowances;
                const netPay = grossPay - deductions;
                return { ...rec, allowances, deductions, grossPay, netPay };
            }
            return rec;
        }));
        handleCancel(recordId);
    };

    const handleEditDataChange = (field: 'allowances' | 'deductions', value: string) => {
        const numValue = parseFloat(value) || 0;
        setEditData(prev => ({ ...prev, [field]: numValue }));
    };

    const handleGeneratePayslips = async () => {
        setIsSaving(true);
        setError(null);
        try {
            let generatedCount = 0;
            for (const rec of payrollData) {
                await savePayslip({
                    employeeId: rec.employeeId,
                    employeeName: rec.employeeName,
                    periodStart: rec.payPeriodStart,
                    periodEnd: rec.payPeriodEnd,
                    basicPay: rec.regularHours * rec.derivedHourlyRate,
                    overtimePay: 0,
                    holidayPay: 0,
                    nightDiff: 0,
                    allowances: rec.allowances,
                    deMinimis: 0,
                    grossPay: rec.grossPay,
                    sss: 0,
                    philhealth: 0,
                    pagibig: 0,
                    tax: 0,
                    otherDeductions: rec.deductions,
                    totalDeductions: rec.deductions,
                    netPay: rec.netPay,
                    status: 'draft',
                });
                generatedCount++;
            }

            await logActivity(
                user,
                'GENERATE',
                'Payslips',
                `Batch-${startDate}-to-${endDate}`,
                `Generated ${generatedCount} new payslips for the period.`
            );

            alert(`${generatedCount} payslip record(s) generated.`);
            setPayslipsGenerated(true);
        } catch (err: any) {
            setError(err.message || 'Failed to generate payslips.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payroll Staging (Phase 4A)</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Base Salary Engine: Regular Hours x Hourly Rate.
                    </p>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md">
                    {error}
                </div>
            )}

            <Card>
                 <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 items-end">
                    <Input label="Pay Period Start" type="date" name="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="Pay Period End" type="date" name="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <Button onClick={generatePayrollData} className="w-full" disabled={isLoading}>Recalculate</Button>
                     {canManage && (
                        <div className="flex items-center justify-center">
                            <label htmlFor="lock-toggle" className="flex items-center cursor-pointer">
                                <div className="relative">
                                <input type="checkbox" id="lock-toggle" className="sr-only" checked={isLocked} onChange={() => setIsLocked(!isLocked)} />
                                <div className={`block w-14 h-8 rounded-full ${isLocked ? 'bg-red-500' : 'bg-gray-300'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isLocked ? 'translate-x-6' : ''}`}></div>
                                </div>
                                <div className="ml-3 text-gray-700 dark:text-gray-300 font-medium">
                                    {isLocked ? 'Locked' : 'Unlocked'}
                                </div>
                            </label>
                        </div>
                    )}
                    {isLocked && canManage && (
                        <Button onClick={handleGeneratePayslips} disabled={payslipsGenerated || isSaving} className="w-full">
                            {isSaving ? 'Saving...' : payslipsGenerated ? 'Payslips Generated' : 'Generate Payslips'}
                        </Button>
                    )}
                </div>
            </Card>

             <Card>
                <div className="overflow-x-auto relative">
                     {isLocked && <div className="absolute inset-0 bg-gray-400/30 dark:bg-gray-800/30 z-10 flex items-center justify-center"><LockClosedIcon/> <span className="font-semibold text-lg">Period Locked</span></div>}
                    {isLoading ? (
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">Loading payroll data...</div>
                    ) : (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                           <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Rate / Hr</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reg. Hrs</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Base Pay</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Adjustments</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Gross Pay</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Net Pay</th>
                                {canEdit && <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>}
                           </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                           {payrollData.map(rec => (
                               <tr key={rec.id} className={editModes[rec.id] ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{rec.employeeName}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">₱{rec.derivedHourlyRate.toFixed(2)}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{rec.regularHours.toFixed(2)}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">₱{(rec.regularHours * rec.derivedHourlyRate).toFixed(2)}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {editModes[rec.id] ? (
                                            <div className="flex gap-2">
                                                <input type="number" placeholder="Allow" value={editData.allowances ?? rec.allowances} onChange={e => handleEditDataChange('allowances', e.target.value)} className="w-20 p-1 rounded-md border-gray-300 dark:bg-gray-700" />
                                                <input type="number" placeholder="Deduct" value={editData.deductions ?? rec.deductions} onChange={e => handleEditDataChange('deductions', e.target.value)} className="w-20 p-1 rounded-md border-gray-300 dark:bg-gray-700" />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">
                                                {rec.allowances > 0 ? `+${rec.allowances} ` : ''}
                                                {rec.deductions > 0 ? `-${rec.deductions}` : ''}
                                                {rec.allowances === 0 && rec.deductions === 0 ? '-' : ''}
                                            </span>
                                        )}
                                   </td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">₱{rec.grossPay.toFixed(2)}</td>
                                   <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-green-600 dark:text-green-400">₱{rec.netPay.toFixed(2)}</td>
                                   {canEdit && (
                                       <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                           {editModes[rec.id] ? (
                                               <div className="flex space-x-2">
                                                   <Button size="sm" onClick={() => handleSave(rec.id)}><CheckIcon /></Button>
                                                   <Button size="sm" variant="secondary" onClick={() => handleCancel(rec.id)}><XIcon /></Button>
                                               </div>
                                           ) : (
                                                <Button size="sm" variant="secondary" onClick={() => handleEdit(rec)} disabled={isLocked}><PencilIcon /></Button>
                                           )}
                                       </td>
                                   )}
                               </tr>
                           ))}
                           {payrollData.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={canEdit ? 8 : 7} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No employee records found for the selected pay period.
                                    </td>
                                </tr>
                           )}
                        </tbody>
                    </table>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default PayrollStaging;

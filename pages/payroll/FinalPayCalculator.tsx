
import React, { useState, useMemo } from 'react';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { mockUsers, mockFinalPayRecords, mockBusinessUnits } from '../../services/mockData';
import { User, FinalPayRecord, FinalPayStatus, Role } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';

interface Deduction {
    id: number;
    description: string;
    amount: number;
}

const TrashIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;

const FinalPayCalculator: React.FC = () => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const [savedRecords, setSavedRecords] = useState<FinalPayRecord[]>(mockFinalPayRecords);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [lastDay, setLastDay] = useState<string>(new Date().toISOString().split('T')[0]);
    const [unusedLeaves, setUnusedLeaves] = useState<number>(0);
    const [deductions, setDeductions] = useState<Deduction[]>([]);
    const [newDeduction, setNewDeduction] = useState({ description: '', amount: '' });
    const [summary, setSummary] = useState<FinalPayRecord | null>(null);
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const accessibleEmployees = useMemo(() => {
        const accessibleBuNames = new Set(accessibleBus.map(b => b.name));
        return mockUsers.filter(u => 
            u.role === Role.Employee && accessibleBuNames.has(u.businessUnit)
        );
    }, [accessibleBus]);

    const selectedEmployee = useMemo(() => {
        return mockUsers.find(u => u.id === selectedEmployeeId);
    }, [selectedEmployeeId]);

    const handleAddDeduction = () => {
        if (newDeduction.description && parseFloat(newDeduction.amount) > 0) {
            setDeductions([...deductions, { ...newDeduction, amount: parseFloat(newDeduction.amount), id: Date.now() }]);
            setNewDeduction({ description: '', amount: '' });
        }
    };

    const handleRemoveDeduction = (id: number) => {
        setDeductions(deductions.filter(d => d.id !== id));
    };

    const handleCalculate = () => {
        if (!selectedEmployee || !lastDay) {
            alert("Please select an employee and set their last day of employment.");
            return;
        }

        const monthlySalary = selectedEmployee.monthlySalary || 0;
        const dailyRate = (monthlySalary * 12) / 261; // Assuming 261 working days in a year

        // Pro-rated 13th Month Pay
        const lastDate = new Date(lastDay);
        const monthsWorked = lastDate.getMonth() + (lastDate.getDate() > 0 ? 1 : 0);
        const prorated13thMonth = (monthlySalary * monthsWorked) / 12;

        // Leave Conversion
        const leaveConversionPay = unusedLeaves * dailyRate;

        // Total Deductions
        const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

        // Final Pay Calculation (Simplified: excludes last paycheck which would be part of a normal run)
        const totalFinalPay = prorated13thMonth + leaveConversionPay - totalDeductions;
        
        const newSummary: FinalPayRecord = {
            id: `FP-${Date.now()}`,
            employeeId: selectedEmployee.id,
            employeeName: selectedEmployee.name,
            lastDay: new Date(lastDay),
            unusedLeaves,
            prorated13thMonth,
            leaveConversionPay,
            deductions: deductions.map(({ id, ...rest }) => rest), // remove internal id
            totalFinalPay,
            status: FinalPayStatus.Draft,
        };
        setSummary(newSummary);
    };
    
    const handleReset = () => {
        setSelectedEmployeeId('');
        setLastDay(new Date().toISOString().split('T')[0]);
        setUnusedLeaves(0);
        setDeductions([]);
        setSummary(null);
    };

    const handleApprove = () => {
        if (!summary) return;
        const approvedRecord = { ...summary, status: FinalPayStatus.HRApproved };
        setSavedRecords(prev => [...prev, approvedRecord]);
        mockFinalPayRecords.push(approvedRecord);
        alert(`Final pay for ${summary.employeeName} has been approved and locked.`);
        handleReset();
    };
    
    const isLocked = summary?.status !== FinalPayStatus.Draft;
    const totalDeductions = useMemo(() => deductions.reduce((sum, d) => sum + d.amount, 0), [deductions]);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Final Pay Calculator</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Inputs Column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card title="1. Employee & Separation Details">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-3">
                                <label htmlFor="employee-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                                <select id="employee-select" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} disabled={!!summary} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                                    <option value="" disabled>-- Select Employee --</option>
                                    {accessibleEmployees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <Input label="Last Day of Employment" type="date" id="last-day" value={lastDay} onChange={(e) => setLastDay(e.target.value)} disabled={!!summary} />
                            <Input label="Unused Leave Credits" type="number" id="unused-leaves" value={unusedLeaves} onChange={(e) => setUnusedLeaves(parseFloat(e.target.value) || 0)} disabled={!!summary} />
                        </div>
                    </Card>

                    <Card title="2. Deductions & Accountabilities">
                        {deductions.length > 0 && (
                            <ul className="space-y-2 mb-4">
                                {deductions.map(d => (
                                    <li key={d.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md">
                                        <div>
                                            <p className="font-medium text-gray-800 dark:text-gray-200">{d.description}</p>
                                            <p className="text-sm text-red-600 dark:text-red-400">- ${d.amount.toFixed(2)}</p>
                                        </div>
                                        <Button size="sm" variant="danger" onClick={() => handleRemoveDeduction(d.id)} disabled={!!summary}>
                                            <TrashIcon />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <div className="md:col-span-2">
                                <Input label="Description" id="deduction-desc" value={newDeduction.description} onChange={e => setNewDeduction({ ...newDeduction, description: e.target.value })} disabled={!!summary} />
                            </div>
                            <Input label="Amount" type="number" id="deduction-amount" value={newDeduction.amount} onChange={e => setNewDeduction({ ...newDeduction, amount: e.target.value })} disabled={!!summary} />
                        </div>
                        <Button onClick={handleAddDeduction} className="mt-4 w-full" variant="secondary" disabled={!!summary}>Add Deduction</Button>
                    </Card>
                    {!summary && <Button onClick={handleCalculate} size="lg" className="w-full">Calculate Final Pay</Button>}
                </div>

                {/* Summary Column */}
                <div className="lg:col-span-1 space-y-6">
                    {summary && (
                        <Card title="3. Final Pay Summary" className="sticky top-6">
                            <div className="space-y-3">
                                <div className="flex justify-between items-baseline p-2">
                                    <span className="text-gray-600 dark:text-gray-400">Pro-rated 13th Month</span>
                                    <span className="font-semibold text-green-600 dark:text-green-400">${summary.prorated13thMonth.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-baseline p-2">
                                    <span className="text-gray-600 dark:text-gray-400">Leave Conversion Pay</span>
                                    <span className="font-semibold text-green-600 dark:text-green-400">${summary.leaveConversionPay.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-baseline p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                                    <span className="text-gray-600 dark:text-gray-400">Total Deductions</span>
                                    <span className="font-semibold text-red-600 dark:text-red-400">-${totalDeductions.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 flex justify-between items-center">
                                    <span className="text-xl font-bold text-gray-800 dark:text-gray-200">Total Final Pay</span>
                                    <span className="text-2xl font-bold text-green-600 dark:text-green-400">${summary.totalFinalPay.toFixed(2)}</span>
                                </div>
                            </div>
                            
                            <Card title="4. Approval Workflow" className="mt-6">
                                <ol className="relative border-l border-gray-200 dark:border-gray-700">                  
                                    <li className="mb-6 ml-4">
                                        <div className={`absolute w-3 h-3 rounded-full mt-1.5 -left-1.5 border border-white dark:border-gray-900 ${summary.status === FinalPayStatus.HRApproved ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">HR Approval</h3>
                                        <p className="text-base font-normal text-gray-500 dark:text-gray-400">{summary.status === FinalPayStatus.HRApproved ? 'Approved & Locked' : 'Pending'}</p>
                                    </li>
                                     <li className="mb-6 ml-4">
                                        <div className="absolute w-3 h-3 bg-gray-200 rounded-full mt-1.5 -left-1.5 border border-white dark:border-gray-900 dark:bg-gray-700"></div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Finance Approval</h3>
                                        <p className="text-base font-normal text-gray-500 dark:text-gray-400">Waiting for HR</p>
                                    </li>
                                      <li className="ml-4">
                                        <div className="absolute w-3 h-3 bg-gray-200 rounded-full mt-1.5 -left-1.5 border border-white dark:border-gray-900 dark:bg-gray-700"></div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Released</h3>
                                        <p className="text-base font-normal text-gray-500 dark:text-gray-400">Pending</p>
                                    </li>
                                </ol>
                            </Card>

                            <div className="mt-4 flex flex-col space-y-2">
                                <Button onClick={handleApprove} disabled={isLocked} className={isLocked ? 'cursor-not-allowed' : ''}>{isLocked ? 'Approved & Locked' : 'Approve & Lock (HR)'}</Button>
                                <Button onClick={handleReset} variant="secondary">Start New Calculation</Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>

             {savedRecords.length > 0 && (
                <Card title="Processed Final Pay Records">
                     <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                             <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Day</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Final Pay Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                             <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {savedRecords.map(rec => (
                                    <tr key={rec.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{rec.employeeName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{rec.lastDay.toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 dark:text-green-400">${rec.totalFinalPay.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200">
                                                {rec.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

        </div>
    );
};

export default FinalPayCalculator;


import React, { useState } from 'react';
import Card from '../../components/ui/Card';
import { mockSSSTable, mockPhilHealthConfig, mockTaxTable, mockHolidayPolicies } from '../../services/mockData';
import { SSSTableRow, PhilHealthConfig, TaxTableRow, HolidayPolicy } from '../../types';
import Button from '../../components/ui/Button';
import { logActivity } from '../../services/auditService';
import { useAuth } from '../../hooks/useAuth';

const PayrollConfiguration: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'SSS' | 'PhilHealth' | 'Tax' | 'Holiday'>('SSS');
    
    const [sssTable, setSssTable] = useState<SSSTableRow[]>(mockSSSTable);
    const [philHealth, setPhilHealth] = useState<PhilHealthConfig>(mockPhilHealthConfig);
    const [taxTable, setTaxTable] = useState<TaxTableRow[]>(mockTaxTable);
    const [holidayPolicies, setHolidayPolicies] = useState<HolidayPolicy[]>(mockHolidayPolicies);

    const tabClass = (tabName: string) => `px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tabName ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;

    // SSS Handlers
    const handleSssChange = (index: number, field: keyof SSSTableRow, value: string) => {
        const newTable = [...sssTable];
        (newTable[index] as any)[field] = parseFloat(value) || 0;
        setSssTable(newTable);
    };

    // PhilHealth Handlers
    const handlePhChange = (field: keyof PhilHealthConfig, value: string) => {
        setPhilHealth(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
    };

    // Tax Handlers
    const handleTaxChange = (index: number, field: keyof TaxTableRow, value: string) => {
        const newTable = [...taxTable];
        (newTable[index] as any)[field] = parseFloat(value) || 0;
        setTaxTable(newTable);
    };
    
    // Holiday Handlers
    const handleHolidayChange = (index: number, field: keyof HolidayPolicy, value: string) => {
        const newPolicies = [...holidayPolicies];
        if (field === 'rate') {
            newPolicies[index].rate = parseFloat(value) || 0;
        } else {
             // Cast to satisfy TS for string fields
            (newPolicies[index] as any)[field] = value;
        }
        setHolidayPolicies(newPolicies);
    };

    const handleSave = () => {
        // In a real app, verify and POST to API. For mock, we just log it.
        logActivity(user, 'UPDATE', 'PayrollConfig', 'Global', 'Updated payroll configuration tables.');
        alert('Configuration saved successfully.');
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payroll Configuration</h1>
            <p className="text-gray-600 dark:text-gray-400">Manage government contribution tables and holiday premium rates.</p>

            <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                <button className={tabClass('SSS')} onClick={() => setActiveTab('SSS')}>SSS Table</button>
                <button className={tabClass('PhilHealth')} onClick={() => setActiveTab('PhilHealth')}>PhilHealth</button>
                <button className={tabClass('Tax')} onClick={() => setActiveTab('Tax')}>Tax Table</button>
                <button className={tabClass('Holiday')} onClick={() => setActiveTab('Holiday')}>Holiday Premiums</button>
            </div>

            <Card>
                {activeTab === 'SSS' && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Range Start</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Range End</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Regular SS</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">WISP</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">EC</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Employee Share</th>
                                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Employer Share</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {sssTable.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.rangeStart} onChange={e => handleSssChange(idx, 'rangeStart', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.rangeEnd} onChange={e => handleSssChange(idx, 'rangeEnd', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.regularSS} onChange={e => handleSssChange(idx, 'regularSS', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.wisp} onChange={e => handleSssChange(idx, 'wisp', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.ec} onChange={e => handleSssChange(idx, 'ec', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.employeeShare} onChange={e => handleSssChange(idx, 'employeeShare', e.target.value)} /></td>
                                        <td className="px-2 py-1"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.employerShare} onChange={e => handleSssChange(idx, 'employerShare', e.target.value)} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-4 text-center">
                            <Button variant="secondary" onClick={() => setSssTable([...sssTable, { rangeStart: 0, rangeEnd: 0, regularSS: 0, wisp: 0, ec: 10, totalContribution: 0, employeeShare: 0, employerShare: 0 }])}>+ Add Row</Button>
                        </div>
                    </div>
                )}

                {activeTab === 'PhilHealth' && (
                    <div className="p-6 max-w-lg">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium">Rate (Decimal, e.g., 0.05 for 5%)</label>
                                <input type="number" step="0.001" value={philHealth.rate} onChange={e => handlePhChange('rate', e.target.value)} className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Min Salary Floor</label>
                                <input type="number" value={philHealth.minSalary} onChange={e => handlePhChange('minSalary', e.target.value)} className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium">Max Salary Cap</label>
                                <input type="number" value={philHealth.maxSalary} onChange={e => handlePhChange('maxSalary', e.target.value)} className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Employer Share Ratio (e.g., 0.5 for 50%)</label>
                                <input type="number" step="0.1" value={philHealth.employerShareRatio} onChange={e => handlePhChange('employerShareRatio', e.target.value)} className="mt-1 block w-full p-2 border rounded-md dark:bg-gray-700" />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'Tax' && (
                    <div className="overflow-x-auto">
                         <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Level</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Range Start</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Range End</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Base Tax</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Rate (% Excess)</th>
                                </tr>
                            </thead>
                             <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {taxTable.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">{row.level}</td>
                                        <td className="px-4 py-2"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.rangeStart} onChange={e => handleTaxChange(idx, 'rangeStart', e.target.value)} /></td>
                                        <td className="px-4 py-2"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.rangeEnd} onChange={e => handleTaxChange(idx, 'rangeEnd', e.target.value)} /></td>
                                        <td className="px-4 py-2"><input type="number" className="w-full p-1 border rounded dark:bg-gray-700" value={row.baseTax} onChange={e => handleTaxChange(idx, 'baseTax', e.target.value)} /></td>
                                        <td className="px-4 py-2"><input type="number" step="0.01" className="w-full p-1 border rounded dark:bg-gray-700" value={row.rate} onChange={e => handleTaxChange(idx, 'rate', e.target.value)} /></td>
                                    </tr>
                                ))}
                             </tbody>
                         </table>
                    </div>
                )}
                
                {activeTab === 'Holiday' && (
                     <div className="overflow-x-auto">
                         <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Holiday Type</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Multiplier Rate</th>
                                    <th className="px-4 py-3 text-xs font-medium uppercase">Description</th>
                                </tr>
                            </thead>
                             <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                                {holidayPolicies.map((policy, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 font-medium">{policy.type}</td>
                                        <td className="px-4 py-2"><input type="number" step="0.1" className="w-full p-1 border rounded dark:bg-gray-700" value={policy.rate} onChange={e => handleHolidayChange(idx, 'rate', e.target.value)} /></td>
                                        <td className="px-4 py-2"><input type="text" className="w-full p-1 border rounded dark:bg-gray-700" value={policy.description} onChange={e => handleHolidayChange(idx, 'description', e.target.value)} /></td>
                                    </tr>
                                ))}
                             </tbody>
                         </table>
                     </div>
                )}
            </Card>
            
            <div className="flex justify-end">
                <Button onClick={handleSave}>Save Configuration</Button>
            </div>
        </div>
    );
};

export default PayrollConfiguration;

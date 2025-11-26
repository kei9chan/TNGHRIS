import React, { useState, useMemo } from 'react';
import { OTRequest, OTStatus, OTRateType, OTStaging, Permission } from '../../types';
import { mockOtRequests } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';

const PayrollPrep: React.FC = () => {
    const { can } = usePermissions();
    const [requests] = useState<OTRequest[]>(mockOtRequests);

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(lastDayOfMonth);
    const [copySuccess, setCopySuccess] = useState('');


    const filteredApprovedRequests = useMemo(() => {
        return requests
            .filter(r => r.status === OTStatus.Approved)
            .filter(r => {
                const reqDate = new Date(r.date);
                const start = new Date(startDate);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // include the whole end day
                return reqDate >= start && reqDate <= end;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [requests, startDate, endDate]);

    const payrollStagingData: OTStaging[] = useMemo(() => {
        return filteredApprovedRequests.map(req => ({
            id: `stage-${req.id}`,
            employeeId: req.employeeId,
            date: req.date,
            approvedHours: req.approvedHours || 0,
            rateType: OTRateType.Weekday, // This would be determined by calendar logic in a real app
            sourceOtId: req.id,
        }));
    }, [filteredApprovedRequests]);

    const exportToCSV = () => {
        const headers = ['Staging ID', 'Employee ID', 'Date', 'Approved Hours', 'Rate Type', 'Source OT ID'];
        const csvRows = [headers.join(',')];

        for (const item of payrollStagingData) {
            const values = [
                item.id,
                item.employeeId,
                new Date(item.date).toLocaleDateString(),
                item.approvedHours.toFixed(2),
                item.rateType,
                item.sourceOtId,
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `payroll_staging_export_${new Date().toISOString()}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const copyJsonToClipboard = () => {
        const jsonString = JSON.stringify(payrollStagingData, null, 2);
        navigator.clipboard.writeText(jsonString).then(() => {
            setCopySuccess('JSON copied to clipboard!');
            setTimeout(() => setCopySuccess(''), 2000);
        }, (err) => {
            console.error('Could not copy text: ', err);
            setCopySuccess('Failed to copy.');
             setTimeout(() => setCopySuccess(''), 2000);
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payroll Prep – Overtime Staging</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        View approved overtime hours for the selected period, ready for payroll processing.
                    </p>
                </div>
                {can('PayrollPrep', Permission.View) && (
                    <div className="flex space-x-2">
                        <Button onClick={copyJsonToClipboard} variant="secondary" disabled={payrollStagingData.length === 0}>
                            {copySuccess || 'Copy JSON for API'}
                        </Button>
                        <Button onClick={exportToCSV} disabled={payrollStagingData.length === 0}>
                            Export to CSV
                        </Button>
                    </div>
                )}
            </div>

            <Card>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                    <Input label="Start Date" type="date" name="startDate" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="End Date" type="date" name="endDate" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
            </Card>

            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date of Overtime</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Approved Hours</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Rate Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Source OT ID</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {payrollStagingData.map(item => (
                                <tr key={item.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.employeeId}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(item.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">{item.approvedHours.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">{item.rateType}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">{item.sourceOtId}</td>
                                </tr>
                            ))}
                            {payrollStagingData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No approved overtime requests found for the selected period.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default PayrollPrep;
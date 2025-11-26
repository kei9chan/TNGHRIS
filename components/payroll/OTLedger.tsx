
import React, { useState, useMemo } from 'react';
import { OTRequest, OTStatus } from '../../types';
import { mockUsers, mockDepartments } from '../../services/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface OTLedgerProps {
    requests: OTRequest[];
}

const DocumentArrowDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const OTLedger: React.FC<OTLedgerProps> = ({ requests }) => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(lastDayOfMonth);
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('Approved');

    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const reqDate = new Date(req.date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const dateMatch = reqDate >= start && reqDate <= end;
            
            let deptMatch = true;
            if (deptFilter) {
                const employee = mockUsers.find(u => u.id === req.employeeId);
                deptMatch = employee?.department === deptFilter;
            }

            const statusMatch = statusFilter === 'All' || req.status === statusFilter;

            return dateMatch && deptMatch && statusMatch;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [requests, startDate, endDate, deptFilter, statusFilter]);

    const totals = useMemo(() => {
        let totalHours = 0;
        filteredRequests.forEach(r => {
            if (r.approvedHours) {
                totalHours += r.approvedHours;
            } else {
                 // Fallback calculation for pending/draft
                 // This is rough estimation
            }
        });
        return {
            totalHours,
            count: filteredRequests.length
        };
    }, [filteredRequests]);

    const exportToCSV = () => {
        const headers = ['Request ID', 'Employee Name', 'Date', 'Start Time', 'End Time', 'Approved Hours', 'Status', 'Reason', 'Manager Note'];
        const csvRows = [headers.join(',')];

        for (const req of filteredRequests) {
            const values = [
                req.id,
                `"${req.employeeName}"`,
                new Date(req.date).toLocaleDateString(),
                req.startTime,
                req.endTime,
                (req.approvedHours || 0).toFixed(2),
                req.status,
                `"${req.reason.replace(/"/g, '""')}"`,
                `"${(req.managerNote || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `ot_ledger_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const departments = [...new Set(mockUsers.map(u => u.department))].sort();

    return (
        <div className="space-y-6">
            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="All">All</option>
                            <option value={OTStatus.Approved}>Approved</option>
                            <option value={OTStatus.Submitted}>Pending</option>
                            <option value={OTStatus.Rejected}>Rejected</option>
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={exportToCSV} disabled={filteredRequests.length === 0} className="w-full flex items-center justify-center">
                            <DocumentArrowDownIcon /> Export CSV
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-lg border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                    <span className="text-indigo-900 dark:text-indigo-200 font-medium">Total Hours</span>
                    <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{totals.totalHours.toFixed(2)}</span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                    <span className="text-blue-900 dark:text-blue-200 font-medium">Total Requests</span>
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totals.count}</span>
                </div>
            </div>

            <Card title="OT Ledger" className="!p-0">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredRequests.map(req => (
                                <tr key={req.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{req.startTime} - {req.endTime}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700 dark:text-gray-300">{req.approvedHours ? req.approvedHours.toFixed(2) : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                         <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            req.status === OTStatus.Approved ? 'bg-green-100 text-green-800' : 
                                            req.status === OTStatus.Rejected ? 'bg-red-100 text-red-800' : 
                                            'bg-yellow-100 text-yellow-800'}`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{req.reason}</td>
                                </tr>
                            ))}
                             {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">No records found matching filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default OTLedger;

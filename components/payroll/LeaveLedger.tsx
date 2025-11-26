
import React, { useState, useMemo } from 'react';
import { LeaveRequest, LeaveRequestStatus } from '../../types';
import { mockUsers, mockLeaveTypes, mockBusinessUnits } from '../../services/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { usePermissions } from '../../hooks/usePermissions';

interface LeaveLedgerProps {
    requests: LeaveRequest[];
}

const DocumentArrowDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const LeaveLedger: React.FC<LeaveLedgerProps> = ({ requests }) => {
    const { getAccessibleBusinessUnits } = usePermissions();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(firstDayOfMonth);
    const [endDate, setEndDate] = useState(lastDayOfMonth);
    const [buFilter, setBuFilter] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('Approved');

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const reqStart = new Date(req.startDate);
            const reqEnd = new Date(req.endDate);
            const filterStart = new Date(startDate);
            const filterEnd = new Date(endDate);
            filterEnd.setHours(23, 59, 59, 999);

            // Check for date overlap
            const dateMatch = reqStart <= filterEnd && reqEnd >= filterStart;
            
            const employee = mockUsers.find(u => u.id === req.employeeId);
            
            let buMatch = true;
            if (buFilter) {
                const buName = mockBusinessUnits.find(b => b.id === buFilter)?.name;
                buMatch = employee?.businessUnit === buName;
            } else {
                // Ensure we only show requests for accessible BUs if no specific filter is set
                const accessibleBuNames = accessibleBus.map(bu => bu.name);
                buMatch = accessibleBuNames.includes(employee?.businessUnit || '');
            }

            let deptMatch = true;
            if (deptFilter) {
                deptMatch = employee?.department === deptFilter;
            }

            const statusMatch = statusFilter === 'All' || req.status === statusFilter;

            return dateMatch && buMatch && deptMatch && statusMatch;
        }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [requests, startDate, endDate, buFilter, deptFilter, statusFilter, accessibleBus]);

    const totals = useMemo(() => {
        let totalDays = 0;
        filteredRequests.forEach(r => {
            totalDays += r.durationDays || 0;
        });
        return {
            totalDays,
            count: filteredRequests.length
        };
    }, [filteredRequests]);

    const getLeaveTypeName = (id: string) => mockLeaveTypes.find(lt => lt.id === id)?.name || 'Unknown';

    const exportToCSV = () => {
        const headers = ['Request ID', 'Employee Name', 'Business Unit', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Reason'];
        const csvRows = [headers.join(',')];

        for (const req of filteredRequests) {
            const employee = mockUsers.find(u => u.id === req.employeeId);
            const values = [
                req.id,
                `"${req.employeeName}"`,
                `"${employee?.businessUnit || ''}"`,
                `"${employee?.department || ''}"`,
                `"${getLeaveTypeName(req.leaveTypeId)}"`,
                new Date(req.startDate).toLocaleDateString(),
                new Date(req.endDate).toLocaleDateString(),
                req.durationDays.toFixed(1),
                req.status,
                `"${req.reason.replace(/"/g, '""')}"`
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `leave_ledger_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const departments = [...new Set(mockUsers.map(u => u.department))].sort();

    return (
        <div className="space-y-6">
            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                    <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All Accessible BUs</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
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
                            <option value={LeaveRequestStatus.Approved}>Approved</option>
                            <option value={LeaveRequestStatus.Pending}>Pending</option>
                            <option value={LeaveRequestStatus.Rejected}>Rejected</option>
                            <option value={LeaveRequestStatus.Cancelled}>Cancelled</option>
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
                    <span className="text-indigo-900 dark:text-indigo-200 font-medium">Total Days</span>
                    <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{totals.totalDays.toFixed(1)}</span>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                    <span className="text-blue-900 dark:text-blue-200 font-medium">Total Requests</span>
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totals.count}</span>
                </div>
            </div>

            <Card title="Leave Ledger" className="!p-0">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Business Unit</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Leave Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Dates</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Days</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredRequests.map(req => {
                                const employee = mockUsers.find(u => u.id === req.employeeId);
                                return (
                                    <tr key={req.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{req.employeeName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{employee?.businessUnit || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getLeaveTypeName(req.leaveTypeId)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700 dark:text-gray-300">{req.durationDays.toFixed(1)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                req.status === LeaveRequestStatus.Approved ? 'bg-green-100 text-green-800' : 
                                                req.status === LeaveRequestStatus.Rejected ? 'bg-red-100 text-red-800' : 
                                                'bg-yellow-100 text-yellow-800'}`}>
                                                {req.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{req.reason}</td>
                                    </tr>
                                );
                            })}
                             {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500 dark:text-gray-400">No records found matching filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default LeaveLedger;

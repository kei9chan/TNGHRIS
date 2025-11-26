
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockAttendanceExceptions, mockUsers, mockBusinessUnits } from '../../../services/mockData';
import { ExceptionType, Role, Permission } from '../../../types';
import Card from '../../../components/ui/Card';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import { usePermissions } from '../../../hooks/usePermissions';

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;

const getExceptionTypeColor = (type: ExceptionType) => {
    switch (type) {
        case ExceptionType.MissingOut:
        case ExceptionType.MissingIn:
            return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        case ExceptionType.LateIn:
        case ExceptionType.Undertime:
            return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
        case ExceptionType.OutsideFence:
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
        default:
            return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const ExceptionsReport: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    const [filters, setFilters] = useState({
        startDate: firstDayOfMonth,
        endDate: today.toISOString().split('T')[0],
        employeeId: '',
        type: '',
        status: '',
    });

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const filteredExceptions = useMemo(() => {
        const accessibleBuNames = new Set(accessibleBus.map(b => b.name));

        return mockAttendanceExceptions.filter(ex => {
            // Date Filter
            const exDate = new Date(ex.date);
            if (filters.startDate && exDate < new Date(filters.startDate)) return false;
            if (filters.endDate) {
                const endOfDay = new Date(filters.endDate);
                endOfDay.setHours(23, 59, 59, 999);
                if (exDate > endOfDay) return false;
            }

            // Access Scope Filter
            const employee = mockUsers.find(u => u.id === ex.employeeId);
            if (!employee || !accessibleBuNames.has(employee.businessUnit)) return false;

            // Specific Filters
            if (filters.employeeId && ex.employeeId !== filters.employeeId) return false;
            if (filters.type && ex.type !== filters.type) return false;
            if (filters.status && ex.status !== filters.status) return false;
            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filters, accessibleBus]);
    
    const exportToCSV = () => {
        const headers = ['ID', 'Employee Name', 'Date', 'Type', 'Details', 'Status', 'Source Event ID'];
        const csvRows = [headers.join(',')];

        for (const ex of filteredExceptions) {
            const values = [
                ex.id,
                `"${ex.employeeName}"`,
                new Date(ex.date).toLocaleDateString(),
                ex.type,
                `"${ex.details.replace(/"/g, '""')}"`,
                ex.status,
                ex.sourceEventId,
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `exceptions_report_${new Date().toISOString()}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };


    return (
        <div className="space-y-6">
             <div className="flex justify-between items-center">
                <div>
                     <Link to="/payroll/reports" className="flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2">
                        <ArrowLeftIcon />
                        Back to Reports
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Exceptions Report</h1>
                </div>
                {can('Reports', Permission.View) && (
                    <Button onClick={exportToCSV} disabled={filteredExceptions.length === 0}>
                        Export to CSV
                    </Button>
                )}
            </div>

            <Card>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4">
                    <Input label="Start Date" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                    <Input label="End Date" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                    <div>
                        <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                        <select name="employeeId" id="employeeId" value={filters.employeeId} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {mockUsers.filter(u => {
                                const accessibleBuNames = accessibleBus.map(b => b.name);
                                return u.role === Role.Employee && accessibleBuNames.includes(u.businessUnit);
                            }).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                        <select name="type" id="type" value={filters.type} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {Object.values(ExceptionType).map(t => <option key={t} value={t}>{t.replace(/([A-Z])/g, ' $1').trim()}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select name="status" id="status" value={filters.status} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            <option value="Pending">Pending</option>
                            <option value="Acknowledged">Acknowledged</option>
                        </select>
                    </div>
                </div>
            </Card>

            <Card>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                           {filteredExceptions.map(ex => (
                                <tr key={ex.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{ex.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(ex.date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getExceptionTypeColor(ex.type)}`}>
                                            {ex.type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-sm truncate" title={ex.details}>{ex.details}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ex.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                            {ex.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredExceptions.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No exceptions match the current filters.
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

export default ExceptionsReport;

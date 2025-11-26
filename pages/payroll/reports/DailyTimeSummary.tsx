
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { mockAttendanceRecords, mockUsers, mockShiftAssignments, mockSites, mockBusinessUnits } from '../../../services/mockData';
import Card from '../../../components/ui/Card';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';
import { usePermissions } from '../../../hooks/usePermissions';
import { Permission } from '../../../types';

interface SummaryRow {
    date: string;
    department: string;
    siteName: string;
    totalMinutes: number;
    employeeCount: number;
}

const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;


const DailyTimeSummary: React.FC = () => {
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const today = new Date();
    const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(lastWeek);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const summaryData = useMemo(() => {
        const accessibleBuNames = new Set(accessibleBus.map(b => b.name));

        const filteredRecords = mockAttendanceRecords.filter(r => {
            const recDate = new Date(r.date);
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            if (!(recDate >= start && recDate <= end && r.totalWorkMinutes > 0)) return false;

            // Access Scope Check
            const employee = mockUsers.find(u => u.id === r.employeeId);
            if (!employee || !accessibleBuNames.has(employee.businessUnit)) return false;

            return true;
        });

        const summaryMap = new Map<string, SummaryRow>();

        filteredRecords.forEach(record => {
            const user = mockUsers.find(u => u.id === record.employeeId);
            const shift = mockShiftAssignments.find(s => s.employeeId === record.employeeId && new Date(s.date).toDateString() === new Date(record.date).toDateString());
            const site = mockSites.find(s => s.id === shift?.locationId);

            const department = user?.department || 'Unknown';
            const siteName = site?.name || 'Unknown';
            const dateStr = new Date(record.date).toLocaleDateString();

            const key = `${dateStr}-${department}-${siteName}`;

            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    date: dateStr,
                    department,
                    siteName,
                    totalMinutes: 0,
                    employeeCount: 0,
                });
            }

            const current = summaryMap.get(key)!;
            current.totalMinutes += record.totalWorkMinutes;
            // This is a simplification; for accuracy, we should count unique employees per key.
            // But for this mock, we assume one record per employee per day.
            current.employeeCount += 1;
        });

        return Array.from(summaryMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.department.localeCompare(b.department));

    }, [startDate, endDate, accessibleBus]);

    const exportToCSV = () => {
        const headers = ['Date', 'Department', 'Site', 'Total Hours', 'Employee Count'];
        const csvRows = [headers.join(',')];

        for (const item of summaryData) {
            const values = [
                item.date,
                item.department,
                item.siteName,
                (item.totalMinutes / 60).toFixed(2),
                item.employeeCount,
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `daily_time_summary_${new Date().toISOString()}.csv`);
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Daily Time Summary</h1>
                </div>
                 {can('Reports', Permission.View) && (
                    <Button onClick={exportToCSV} disabled={summaryData.length === 0}>
                        Export to CSV
                    </Button>
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Department</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Site</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Hours</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee Count</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                           {summaryData.map((row, index) => (
                               <tr key={index}>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{row.date}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{row.department}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{row.siteName}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">{(row.totalMinutes / 60).toFixed(2)}</td>
                                   <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{row.employeeCount}</td>
                               </tr>
                           ))}
                           {summaryData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No attendance data found for the selected period.
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

export default DailyTimeSummary;

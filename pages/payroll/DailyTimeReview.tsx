
import React, { useState, useMemo, useEffect } from 'react';
import { mockShiftAssignments, mockTimeEvents, mockShiftTemplates, mockUsers, mockBusinessUnits } from '../../services/mockData';
import { AttendanceRecord, AttendanceException, AttendanceStatus } from '../../types';
import { generateDailyRecords } from '../../services/attendanceService';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import DailyRecordModal from '../../components/payroll/DailyRecordModal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Role } from '../../types';

const DailyTimeReview: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [buFilter, setBuFilter] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const refreshRecords = () => {
        // In a real app, we'd fetch by date range. Here we regen everything.
        const allRecords = generateDailyRecords(mockShiftAssignments, mockTimeEvents, mockShiftTemplates);
        setRecords(allRecords);
    };

    useEffect(() => {
        refreshRecords();
    }, [mockTimeEvents.length]); // Re-run if events change

    const filteredRecords = useMemo(() => {
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));
        const accessibleBuNames = new Set(accessibleBus.map(b => b.name));

        return records.filter(r => {
            const dateMatch = new Date(r.date).toISOString().split('T')[0] === filterDate;
            
            // BU Filter
            const employee = mockUsers.find(u => u.id === r.employeeId);
            
            // Check Scope
            if (!employee || !accessibleBuNames.has(employee.businessUnit)) return false;

            let buMatch = true;
            if (buFilter) {
                const buName = mockBusinessUnits.find(b => b.id === buFilter)?.name;
                buMatch = employee?.businessUnit === buName;
            }
            
            // Manager scope filter
            let scopeMatch = true;
            if (user?.role === Role.Manager) {
                 // Only show direct reports
                 scopeMatch = employee?.managerId === user.id || r.employeeId === user.id;
            }

            return dateMatch && buMatch && scopeMatch;
        }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    }, [records, filterDate, buFilter, user, accessibleBus]);

    const handleFix = (record: AttendanceRecord) => {
        setSelectedRecord(record);
        setIsModalOpen(true);
    };
    
    const getStatusBadge = (status: AttendanceStatus) => {
        const colors = {
            [AttendanceStatus.Pending]: 'bg-yellow-100 text-yellow-800',
            [AttendanceStatus.Reviewed]: 'bg-blue-100 text-blue-800',
            [AttendanceStatus.Disputed]: 'bg-red-100 text-red-800',
            [AttendanceStatus.Finalized]: 'bg-green-100 text-green-800',
        };
        return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status]}`}>{status}</span>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Daily Timekeeping Review</h1>
            <p className="text-gray-600 dark:text-gray-400">Review daily logs, flag discrepancies, and correct attendance records before payroll.</p>
            
            <Card>
                <div className="flex flex-wrap gap-4 p-4 items-end">
                    <Input label="Date" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                         <select value={buFilter} onChange={e => setBuFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All Accessible</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <Card className="!p-0">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Employee</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Shift</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Logs (In - Out)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total Hrs</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Flags</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredRecords.map(record => (
                                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{record.employeeName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {record.shiftName} <br/>
                                        <span className="text-xs text-gray-400">
                                            {record.scheduledStart ? new Date(record.scheduledStart).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'OFF'} - 
                                            {record.scheduledEnd ? new Date(record.scheduledEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {record.firstIn ? new Date(record.firstIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'} - 
                                        {record.lastOut ? new Date(record.lastOut).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}
                                        {record.hasManualEntry && <span className="ml-2 text-xs text-gray-400 italic">(Edited)</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {(record.totalWorkMinutes / 60).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1">
                                            {record.exceptions.map(ex => (
                                                <span key={ex} className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                                                    {ex.replace(/([A-Z])/g, ' $1').trim()}
                                                </span>
                                            ))}
                                            {record.exceptions.length === 0 && <span className="text-green-500 text-sm">OK</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getStatusBadge(record.status)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Button size="sm" variant="secondary" onClick={() => handleFix(record)}>Fix Record</Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-500">No records found for this date/filter.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <DailyRecordModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                record={selectedRecord}
                onUpdate={refreshRecords}
            />
        </div>
    );
};

export default DailyTimeReview;

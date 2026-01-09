
import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceRecord, AttendanceStatus, TimeEventSource, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import DailyRecordModal from '../../components/payroll/DailyRecordModal';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';

const DailyTimeReview: React.FC = () => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits, getVisibleEmployeeIds, can } = usePermissions();
    const canView = can('DailyTimeReview', Permission.View);
    const canManage = can('DailyTimeReview', Permission.Manage);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);
    const [employees, setEmployees] = useState<{ id: string; name: string; businessUnit?: string | null }[]>([]);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    const [buFilter, setBuFilter] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(businessUnits), [getAccessibleBusinessUnits, businessUnits]);

    const loadLookups = async () => {
        const [{ data: buData }, { data: empData }] = await Promise.all([
            supabase.from('business_units').select('id, name').order('name'),
            supabase.from('hris_users').select('id, full_name, business_unit').order('full_name'),
        ]);
        setBusinessUnits((buData || []).map((b: any) => ({ id: b.id, name: b.name })));
        setEmployees((empData || []).map((e: any) => ({ id: e.id, name: e.full_name || 'Unknown', businessUnit: e.business_unit })));
    };

    const refreshRecords = async () => {
        if (!filterDate) return;
        const start = new Date(filterDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filterDate);
        end.setHours(23, 59, 59, 999);

        const visibleIds = getVisibleEmployeeIds();
        let eventsQuery = supabase
            .from('time_events')
            .select('*')
            .gte('timestamp', start.toISOString())
            .lte('timestamp', end.toISOString());

        if (!canManage && visibleIds.length > 0) {
            eventsQuery = eventsQuery.in('employee_id', visibleIds);
        }
        const { data: eventsData } = await eventsQuery;

        const { data: shiftData } = await supabase
            .from('shift_assignments')
            .select('*')
            .eq('date', filterDate);

        const eventsByEmp = new Map<string, any[]>();
        (eventsData || []).forEach((ev: any) => {
            if (!eventsByEmp.has(ev.employee_id)) eventsByEmp.set(ev.employee_id, []);
            eventsByEmp.get(ev.employee_id)!.push(ev);
        });

        const records: AttendanceRecord[] = [];
        const employeeMap = new Map(employees.map(e => [e.id, e]));

        const employeesToProcess = new Set<string>();
        eventsByEmp.forEach((_, empId) => employeesToProcess.add(empId));
        (shiftData || []).forEach((row: any) => employeesToProcess.add(row.employee_id));

        employeesToProcess.forEach(empId => {
            const empEvents = (eventsByEmp.get(empId) || []).sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            const firstInRow = empEvents.find(ev => (ev.type || '').toLowerCase().includes('in'));
            const lastOutRow = [...empEvents].reverse().find(ev => (ev.type || '').toLowerCase().includes('out'));
            const firstIn = firstInRow ? new Date(firstInRow.timestamp) : null;
            const lastOut = lastOutRow ? new Date(lastOutRow.timestamp) : null;
            const totalWorkMinutes = firstIn && lastOut ? Math.max(0, (lastOut.getTime() - firstIn.getTime()) / 60000) : 0;

            const hasManualEntry = empEvents.some(ev => (ev.source || '').toLowerCase().includes('manual'));
            const anomalies = empEvents.flatMap(ev => ev.anomaly_tags || []);

            const shift = (shiftData || []).find((s: any) => s.employee_id === empId);
            const scheduledStart = shift?.scheduled_start ? new Date(shift.scheduled_start) : null;
            const scheduledEnd = shift?.scheduled_end ? new Date(shift.scheduled_end) : null;

            const empInfo = employeeMap.get(empId);
            const record: AttendanceRecord = {
                id: `att-${empId}-${filterDate}`,
                employeeId: empId,
                employeeName: empInfo?.name || empId,
                date: new Date(filterDate),
                scheduledStart,
                scheduledEnd,
                shiftName: shift?.shift_template_id || 'Scheduled',
                firstIn,
                lastOut,
                totalWorkMinutes,
                breakMinutes: 0,
                overtimeMinutes: 0,
                exceptions: anomalies,
                hasManualEntry,
                status: AttendanceStatus.Pending,
            };

            // BU filter and access scope
            if (buFilter) {
                const buName = businessUnits.find(b => b.id === buFilter)?.name;
                if (empInfo?.businessUnit !== buName) return;
            } else if (accessibleBus.length > 0) {
                const buNames = new Set(accessibleBus.map(b => b.name));
                if (empInfo?.businessUnit && !buNames.has(empInfo.businessUnit)) return;
            }

            records.push(record);
        });

        setRecords(records.sort((a, b) => a.employeeName.localeCompare(b.employeeName)));
    };

    useEffect(() => {
        loadLookups();
    }, []);

    useEffect(() => {
        refreshRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterDate, buFilter, employees.length, businessUnits.length]);

    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            const dateMatch = new Date(r.date).toISOString().split('T')[0] === filterDate;
            return dateMatch;
        });
    }, [records, filterDate]);

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Daily Time Review.
                    </div>
                </Card>
            </div>
        );
    }

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

import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceExceptionRecord, ExceptionType, Role, Permission } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import ExceptionsTable from '../../components/payroll/ExceptionsTable';
import { supabase } from '../../services/supabaseClient';

const AttendanceExceptions: React.FC = () => {
    const { user } = useAuth();
    const { getVisibleEmployeeIds, can } = usePermissions();
    const canView = can('Exceptions', Permission.View);
    const canManage = can('Exceptions', Permission.Manage);
    
    const [exceptions, setExceptions] = useState<AttendanceExceptionRecord[]>([]);
    const [employees, setEmployees] = useState<{ id: string; name: string; role: Role }[]>([]);

    // Dynamic generation of exceptions based on current logs and schedule
    useEffect(() => {
        const load = async () => {
            if (!canView) {
                setExceptions([]);
                return;
            }
            const [{ data: userData }, { data: eventsData }, { data: shiftsData }] = await Promise.all([
                supabase.from('hris_users').select('id, full_name, role'),
                supabase.from('time_events').select('*, hris_users:employee_id(full_name)').order('timestamp', { ascending: false }).limit(2000),
                supabase.from('shift_assignments').select('*').order('date', { ascending: false }).limit(2000),
            ]);

            const visibleIds = getVisibleEmployeeIds();
            const employeeMap = new Map((userData || []).map((u: any) => [u.id, { id: u.id, name: u.full_name || 'Unknown', role: u.role as Role }]));
            // Capture names from joined events if not present in hris_users
            (eventsData || []).forEach((ev: any) => {
                const joinedName = ev.hris_users?.full_name;
                if (joinedName && (!employeeMap.has(ev.employee_id) || employeeMap.get(ev.employee_id)?.name === 'Unknown')) {
                    employeeMap.set(ev.employee_id, { id: ev.employee_id, name: joinedName, role: Role.Employee });
                }
            });
            setEmployees(Array.from(employeeMap.values()));

            const filteredEvents = (eventsData || []).filter((e: any) => canManage || visibleIds.includes(e.employee_id));
            const eventsByDay = new Map<string, any[]>();
            filteredEvents.forEach((e: any) => {
                const day = e.timestamp ? e.timestamp.slice(0, 10) : null;
                if (!day) return;
                const key = `${e.employee_id}|${day}`; // use pipe to avoid UUID hyphen collisions
                if (!eventsByDay.has(key)) eventsByDay.set(key, []);
                eventsByDay.get(key)!.push(e);
            });

            const shiftByEmpDay = new Map<string, any>();
            (shiftsData || []).forEach((s: any) => {
                const key = `${s.employee_id}-${s.date}`;
                shiftByEmpDay.set(key, s);
            });

            const derived: AttendanceExceptionRecord[] = [];
            eventsByDay.forEach((evs, key) => {
                const [empId, day] = key.split('|');
                const sorted = evs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                const firstIn = sorted.find(ev => (ev.type || '').toLowerCase().includes('in'));
                const lastOut = [...sorted].reverse().find(ev => (ev.type || '').toLowerCase().includes('out'));
                const dateObj = day ? new Date(`${day}T00:00:00`) : new Date();

                const pushEx = (type: ExceptionType, details: string, sourceId: string) => {
                    derived.push({
                        id: `${empId}-${day}-${type}`,
                        employeeId: empId,
                        employeeName: employeeMap.get(empId)?.name || evs[0]?.hris_users?.full_name || empId,
                        date: dateObj,
                        type,
                        details,
                        status: 'Pending',
                        sourceEventId: sourceId,
                    });
                };

                if (!firstIn) pushEx(ExceptionType.MissingIn, 'No clock-in found for this day.', evs[0]?.id || '');
                if (!lastOut) pushEx(ExceptionType.MissingOut, 'No clock-out found for this day.', evs[evs.length - 1]?.id || '');

                const anyOutside = evs.some(ev => (ev.anomaly_tags || []).some((t: string) => t.toLowerCase().includes('outside')));
                if (anyOutside) pushEx(ExceptionType.OutsideFence, 'Clock recorded outside geofence.', evs.find(ev => (ev.anomaly_tags || []).length)?.id || evs[0]?.id || '');

                const doubleLog = sorted.filter(ev => (ev.type || '').toLowerCase().includes('in')).length > 1;
                if (doubleLog) pushEx(ExceptionType.DoubleLog, 'Multiple clock-ins detected.', firstIn?.id || evs[0]?.id || '');

                // Missing break/extended break detection skipped for now without break events
            });

            setExceptions(derived);
        };
        load();
    }, [canView, canManage, getVisibleEmployeeIds]);

    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        employeeId: '',
        type: '',
        status: 'Pending',
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAcknowledge = (exceptionId: string) => {
        setExceptions(prev => prev.map(ex => 
            ex.id === exceptionId ? { ...ex, status: 'Acknowledged' } : ex
        ));
    };

    const filteredExceptions = useMemo(() => {
        return exceptions.filter(ex => {
            const exDate = new Date(ex.date);
            if (filters.startDate && exDate < new Date(filters.startDate)) return false;
            if (filters.endDate) {
                const endOfDay = new Date(filters.endDate);
                endOfDay.setHours(23, 59, 59, 999);
                if (exDate > endOfDay) return false;
            }
            if (filters.employeeId && ex.employeeId !== filters.employeeId) return false;
            if (filters.type && ex.type !== filters.type) return false;
            if (filters.status && ex.status !== filters.status) return false;
            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [filters, exceptions]);

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Attendance Exceptions.
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Attendance Exceptions</h1>
            <p className="text-gray-600 dark:text-gray-400">Review and resolve flagged attendance records to ensure payroll accuracy.</p>

            <Card>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4">
                    <Input label="Start Date" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                    <Input label="End Date" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                    <div>
                        <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                        <select name="employeeId" id="employeeId" value={filters.employeeId} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {employees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                <ExceptionsTable exceptions={filteredExceptions} onAcknowledge={handleAcknowledge} />
            </Card>
        </div>
    );
};

export default AttendanceExceptions;

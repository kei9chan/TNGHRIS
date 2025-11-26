import React, { useState, useMemo, useEffect } from 'react';
import { mockShiftAssignments, mockTimeEvents, mockShiftTemplates, mockUsers, mockAttendanceExceptions } from '../../services/mockData';
import { AttendanceExceptionRecord, ExceptionType, Role } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import ExceptionsTable from '../../components/payroll/ExceptionsTable';
import { generateAttendanceExceptions } from '../../services/attendanceService';

const AttendanceExceptions: React.FC = () => {
    const { user } = useAuth();
    
    // Initialize with mock exceptions for history
    const [exceptions, setExceptions] = useState<AttendanceExceptionRecord[]>([]);

    // Dynamic generation of exceptions based on current logs and schedule
    useEffect(() => {
        // In a real app, this would be an API call or a background job.
        // Here we combine static mock history with dynamic calculation.
        const dynamicExceptions = generateAttendanceExceptions(mockShiftAssignments, mockTimeEvents, mockShiftTemplates);
        
        // Deduplicate based on ID (simple merge for prototype)
        const allExceptions = [...mockAttendanceExceptions];
        dynamicExceptions.forEach(dyn => {
             if (!allExceptions.some(ex => ex.id === dyn.id)) {
                 allExceptions.push(dyn);
             }
        });
        
        setExceptions(allExceptions);
    }, []);

    // Managers should only see exceptions for their direct reports.
    // Admins/HR can see all. This simulates that logic.
    const viewableExceptions = useMemo(() => {
        if (user?.role === Role.Manager) {
            // In a real app, you'd have a `managerId` on the user object.
            // Here, we'll just show exceptions for John Doe and Jane Smith, who are managed by Peter Jones.
            const managedEmployeeIds = ['3', '4', '101', '102', '103', '106', '107']; // Expanded team
            return exceptions.filter(e => managedEmployeeIds.includes(e.employeeId));
        }
        return exceptions;
    }, [exceptions, user?.role]);

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
        return viewableExceptions.filter(ex => {
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
    }, [filters, viewableExceptions]);

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
                            {mockUsers.filter(u => u.role === Role.Employee).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
import React, { useState, useEffect, useMemo } from 'react';
import { User, TimeEventType } from '../../types';
import { mockUsers, mockTimeEvents, mockShiftAssignments, mockShiftTemplates, mockBusinessUnits } from '../../services/mockData';
import Card from '../ui/Card';

interface LiveShiftStatusDashboardProps {
  selectedBuId: string;
  actions?: React.ReactNode;
}

const StatusIndicator: React.FC<{ status: 'in' | 'late' | 'break' }> = ({ status }) => {
    const colorClasses = {
        in: 'bg-green-500',
        late: 'bg-yellow-400',
        break: 'bg-blue-500',
    };
    return <div className={`h-3 w-3 rounded-full flex-shrink-0 ${colorClasses[status]}`} title={status}></div>;
};


const EmployeeStatusCard: React.FC<{ employee: User, status: 'in' | 'late' | 'break' }> = ({ employee, status }) => (
    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-slate-700/50">
        <img 
            src={employee.profilePictureUrl || `https://i.pravatar.cc/150?u=${employee.id}`} 
            alt={employee.name} 
            className="h-10 w-10 rounded-full object-cover" 
        />
        <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate text-gray-800 dark:text-gray-200">{employee.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{employee.position}</p>
        </div>
        <StatusIndicator status={status} />
    </div>
);

const StatusColumn: React.FC<{ title: string; data: Record<string, User[]>; status: 'in' | 'late' | 'break'; count: number; colorClass: string }> = ({ title, data, status, count, colorClass }) => {
    const departments = Object.keys(data).sort();
    
    return (
        <div>
            <h3 className={`font-semibold text-lg mb-2 ${colorClass}`}>{title} ({count})</h3>
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                {departments.length > 0 ? departments.map(dept => (
                    <div key={dept}>
                        <h4 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 pb-1 mb-1 border-b border-gray-200 dark:border-gray-700">{dept}</h4>
                        <div className="space-y-2">
                            {data[dept].map(emp => <EmployeeStatusCard key={emp.id} employee={emp} status={status} />)}
                        </div>
                    </div>
                )) : <p className="text-sm text-gray-500">No employees in this category.</p> }
            </div>
        </div>
    );
};


const LiveShiftStatusDashboard: React.FC<LiveShiftStatusDashboardProps> = ({ selectedBuId, actions }) => {
    const [now, setNow] = useState(new Date('2025-11-19T13:30:00')); // Set to a specific time for consistent demo

    useEffect(() => {
        // In a real scenario, you might not want a timer if you're demoing a specific point in time.
        // For a live dashboard, this would be new Date().
        // const timer = setInterval(() => setNow(new Date()), 30000); 
        // return () => clearInterval(timer);
    }, []);

    const { clockedIn, scheduledLate, onBreak } = useMemo(() => {
        const selectedBuName = mockBusinessUnits.find(bu => bu.id === selectedBuId)?.name;
        if (!selectedBuName) {
            return { clockedIn: {}, scheduledLate: {}, onBreak: {} };
        }

        const employeesInBU = mockUsers.filter(u => u.businessUnit === selectedBuName && u.status === 'Active');

        const categorized = {
            clockedIn: {} as Record<string, User[]>,
            scheduledLate: {} as Record<string, User[]>,
            onBreak: {} as Record<string, User[]>,
        };
        
        const addToGroup = (group: Record<string, User[]>, employee: User) => {
            const dept = employee.department || 'No Department';
            if (!group[dept]) {
                group[dept] = [];
            }
            group[dept].push(employee);
        };

        for (const employee of employeesInBU) {
            const todaysEvents = mockTimeEvents
                .filter(e => e.employeeId === employee.id && new Date(e.timestamp).toDateString() === now.toDateString())
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            const latestEventToday = todaysEvents[0];

            if (!latestEventToday) {
                // No events today, check if they are late for their shift.
                const todaysShiftAssignment = mockShiftAssignments.find(a => 
                    a.employeeId === employee.id && 
                    new Date(a.date).toDateString() === now.toDateString()
                );

                if (todaysShiftAssignment) {
                    const shiftTemplate = mockShiftTemplates.find(t => t.id === todaysShiftAssignment.shiftTemplateId);
                    if (shiftTemplate && shiftTemplate.startTime && shiftTemplate.startTime !== '00:00') {
                        const [hours, minutes] = shiftTemplate.startTime.split(':').map(Number);
                        const shiftStartTime = new Date(now);
                        shiftStartTime.setHours(hours, minutes, 0, 0);
                        
                        const gracePeriod = shiftTemplate.gracePeriodMinutes || 15;
                        const graceTime = new Date(shiftStartTime.getTime() + gracePeriod * 60000);

                        if (now > graceTime) {
                            addToGroup(categorized.scheduledLate, employee);
                        }
                    }
                }
            } else {
                // Has events today, determine status from the latest one.
                if (latestEventToday.type === TimeEventType.StartBreak) {
                    addToGroup(categorized.onBreak, employee);
                } else if (latestEventToday.type === TimeEventType.ClockIn || latestEventToday.type === TimeEventType.EndBreak) {
                    addToGroup(categorized.clockedIn, employee);
                }
                // If latest event is CLOCK_OUT, they are done for the day. Do nothing.
            }
        }
        
        // Sort employees within each department alphabetically
        for (const dept in categorized.clockedIn) {
            categorized.clockedIn[dept].sort((a, b) => a.name.localeCompare(b.name));
        }
        for (const dept in categorized.scheduledLate) {
            categorized.scheduledLate[dept].sort((a, b) => a.name.localeCompare(b.name));
        }
        for (const dept in categorized.onBreak) {
            categorized.onBreak[dept].sort((a, b) => a.name.localeCompare(b.name));
        }

        return categorized;
    }, [selectedBuId, now]);

    const clockedInCount = Object.values(clockedIn).flat().length;
    const lateCount = Object.values(scheduledLate).flat().length;
    const onBreakCount = Object.values(onBreak).flat().length;

    return (
        <Card title="Who's On Shift - Live Status" className="mb-6" actions={actions}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatusColumn title="Clocked In" data={clockedIn} status="in" count={clockedInCount} colorClass="text-green-600 dark:text-green-400" />
                <StatusColumn title="Scheduled (Late)" data={scheduledLate} status="late" count={lateCount} colorClass="text-yellow-500 dark:text-yellow-400" />
                <StatusColumn title="On Break" data={onBreak} status="break" count={onBreakCount} colorClass="text-blue-500 dark:text-blue-400" />
            </div>
        </Card>
    );
};

export default LiveShiftStatusDashboard;
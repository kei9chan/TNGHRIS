import React from 'react';
import { ShiftTemplate, ShiftAssignment, User, OperatingHours } from '../../types';

interface TimelineViewProps {
    weekDates: Date[];
    employees: User[];
    assignments: ShiftAssignment[];
    templates: ShiftTemplate[];
    operatingHours: OperatingHours | null;
    onOpenDrawer: (employee: User, date: Date) => void;
    isEditable: boolean;
}

const timeToPercent = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return ((hours * 60 + minutes) / (24 * 60)) * 100;
};

const TimelineView: React.FC<TimelineViewProps> = ({ weekDates, employees, assignments, templates, operatingHours, onOpenDrawer, isEditable }) => {

    const hours = Array.from({ length: 24 }, (_, i) => i); // 0 to 23

    const getShiftStyle = (shift: ShiftTemplate) => {
        const startPercent = timeToPercent(shift.startTime);
        const endPercent = timeToPercent(shift.endTime);
        let widthPercent = endPercent - startPercent;
        if (widthPercent < 0) { // Handles overnight shifts
            widthPercent = 100 - startPercent + endPercent;
        }
        return {
            left: `${startPercent}%`,
            width: `${widthPercent}%`,
        };
    };

    const shiftColorClasses: Record<string, string> = {
        blue: 'bg-blue-500 border-blue-700 text-white',
        indigo: 'bg-indigo-500 border-indigo-700 text-white',
        yellow: 'bg-yellow-400 border-yellow-600 text-yellow-900',
        green: 'bg-green-500 border-green-700 text-white',
        cyan: 'bg-cyan-500 border-cyan-700 text-white',
        gray: 'bg-gray-400 border-gray-600 text-white',
    };

    return (
        <div className="overflow-x-auto border dark:border-gray-700 rounded-lg">
            <div className="flex" style={{ width: 'fit-content' }}>
                {/* Employee Column */}
                <div className="w-48 flex-shrink-0 sticky left-0 bg-white dark:bg-slate-800 z-10">
                    <div className="h-20 flex items-center px-3 font-semibold border-b border-r dark:border-gray-700">Employee</div>
                    {employees.map(employee => (
                        <div key={employee.id} className="h-16 flex items-center px-3 border-b border-r dark:border-gray-700">
                            <div>
                                <p className="font-medium text-sm text-gray-900 dark:text-white">{employee.name}</p>
                                <p className="text-xs text-gray-500">{employee.position}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Timeline Columns for each day */}
                {weekDates.map(date => (
                    <div key={date.toISOString()} className="w-96 flex-shrink-0">
                        {/* Day Header */}
                        <div className="h-12 flex flex-col items-center justify-center border-b border-r dark:border-gray-700">
                            <p className="font-semibold text-gray-900 dark:text-white">{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{date.getDate()}</p>
                        </div>
                        {/* Hour Header */}
                        <div className="h-8 flex border-b border-r dark:border-gray-700 text-xs text-gray-500">
                            {hours.map(hour => (
                                <div key={hour} className="flex-1 text-center border-l dark:border-gray-700 pt-1">
                                    {hour % 2 === 0 ? hour.toString().padStart(2, '0') : ''}
                                </div>
                            ))}
                        </div>

                        {/* Shift Rows */}
                        {employees.map(employee => {
                            const assignment = assignments.find(a => a.employeeId === employee.id && new Date(a.date).toDateString() === date.toDateString());
                            const template = assignment ? templates.find(t => t.id === assignment.shiftTemplateId) : null;
                            
                            return (
                                <div 
                                    key={employee.id} 
                                    className={`h-16 relative border-b border-r dark:border-gray-700 bg-gray-50 dark:bg-slate-800/50 ${isEditable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700/50' : ''}`}
                                    onClick={isEditable ? () => onOpenDrawer(employee, date) : undefined}
                                >
                                    {/* Hour grid lines */}
                                    {hours.slice(1).map(hour => (
                                        <div key={hour} className="absolute h-full border-l border-dashed border-gray-200 dark:border-gray-700" style={{ left: `${(hour / 24) * 100}%` }}></div>
                                    ))}
                                    {template && (
                                        <div 
                                            className={`absolute top-2 bottom-2 rounded-md flex items-center px-2 text-xs font-bold overflow-hidden ${shiftColorClasses[template.color]} ${isEditable ? 'cursor-pointer' : 'cursor-default'}`} 
                                            style={getShiftStyle(template)}
                                        >
                                            <span className="truncate">{template.name}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TimelineView;
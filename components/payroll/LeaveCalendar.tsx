
import React, { useState, useMemo } from 'react';
import { LeaveRequest, User } from '../../types';
import Button from '../ui/Button';

interface LeaveCalendarProps {
    leaves: LeaveRequest[]; // Expected to be only APPROVED leaves relevant to the context
    currentUser: User;
    employees?: User[]; // Needed to map IDs to names if not present in LeaveRequest (though mock has employeeName)
}

// Icons
const ChevronLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>;
const ChevronRightIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>;

const LeaveCalendar: React.FC<LeaveCalendarProps> = ({ leaves, currentUser }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const getMonthData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

        const calendarDays: (Date | null)[] = [];
        
        // Pad empty days at start
        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarDays.push(null);
        }
        
        // Fill actual days
        for (let i = 1; i <= daysInMonth; i++) {
            calendarDays.push(new Date(year, month, i));
        }

        return { year, month, calendarDays };
    }, [currentDate]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const isSameDate = (d1: Date, d2: Date) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const getLeavesForDay = (date: Date) => {
        return leaves.filter(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            // Normalize times to avoid timezone issues for simple day comparison
            start.setHours(0,0,0,0);
            end.setHours(23,59,59,999);
            date.setHours(12,0,0,0); // Check midday to be safe
            return date >= start && date <= end;
        });
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthName = currentDate.toLocaleString('default', { month: 'long' });

    return (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                    <span className="mr-2">📅</span> {monthName} {getMonthData.year}
                </h2>
                <div className="flex space-x-2">
                    <Button variant="secondary" size="sm" onClick={handlePrevMonth}><ChevronLeftIcon/></Button>
                    <Button variant="secondary" size="sm" onClick={handleToday}>Today</Button>
                    <Button variant="secondary" size="sm" onClick={handleNextMonth}><ChevronRightIcon/></Button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50">
                {weekDays.map(day => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>
            
            <div className="grid grid-cols-7 auto-rows-fr bg-gray-200 dark:bg-slate-700 gap-px border-b border-gray-200 dark:border-slate-700">
                {getMonthData.calendarDays.map((day, index) => {
                    if (!day) {
                        return <div key={`empty-${index}`} className="bg-white dark:bg-slate-800 min-h-[100px]"></div>;
                    }

                    const dayLeaves = getLeavesForDay(day);
                    const isToday = isSameDate(day, new Date());

                    return (
                        <div key={day.toISOString()} className={`bg-white dark:bg-slate-800 min-h-[100px] p-2 relative hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors`}>
                            <div className="flex justify-between items-start">
                                <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {day.getDate()}
                                </span>
                            </div>
                            
                            <div className="mt-1 space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                                {dayLeaves.map(leave => {
                                    const isMyLeave = leave.employeeId === currentUser.id;
                                    return (
                                        <div 
                                            key={leave.id} 
                                            className={`text-xs px-2 py-1 rounded truncate shadow-sm border-l-2 ${
                                                isMyLeave 
                                                ? 'bg-green-100 text-green-800 border-green-500 dark:bg-green-900/30 dark:text-green-200' 
                                                : 'bg-blue-100 text-blue-800 border-blue-500 dark:bg-blue-900/30 dark:text-blue-200'
                                            }`}
                                            title={`${leave.employeeName} - ${leave.leaveTypeId} (${leave.reason})`}
                                        >
                                            {isMyLeave ? 'Me' : leave.employeeName.split(' ')[0]}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Legend */}
            <div className="p-4 bg-gray-50 dark:bg-slate-900/30 flex gap-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-500 mr-2"></span>
                    My Approved Leave
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-500 mr-2"></span>
                    Teammate Approved Leave
                </div>
            </div>
        </div>
    );
};

export default LeaveCalendar;
